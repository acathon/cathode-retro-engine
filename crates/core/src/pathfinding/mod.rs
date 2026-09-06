//! Grid pathfinding.
//!
//! A* over a rectangular grid of passable/blocked cells. Both the tilemap
//! games and the raycaster share one grid shape, so both share one solver:
//! give it a `blocked` predicate and it does not care whether a cell is a
//! tile index, a raycast wall type, or something a game invented.

use std::cmp::Ordering;
use std::collections::BinaryHeap;

/// A grid of passable cells, addressed in column/row order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Grid {
    cols: i32,
    rows: i32,
    blocked: Vec<bool>,
}

impl Grid {
    /// Build a grid from `cells`, marking a cell blocked when `blocked`
    /// returns true for it.
    pub fn from_cells<T>(cols: u32, rows: u32, cells: &[T], blocked: impl Fn(&T) -> bool) -> Self {
        Self {
            cols: cols as i32,
            rows: rows as i32,
            blocked: cells.iter().map(blocked).collect(),
        }
    }

    /// A grid with every cell passable.
    pub fn open(cols: u32, rows: u32) -> Self {
        Self {
            cols: cols as i32,
            rows: rows as i32,
            blocked: vec![false; (cols * rows) as usize],
        }
    }

    pub fn cols(&self) -> i32 {
        self.cols
    }

    pub fn rows(&self) -> i32 {
        self.rows
    }

    pub fn in_bounds(&self, x: i32, y: i32) -> bool {
        x >= 0 && y >= 0 && x < self.cols && y < self.rows
    }

    /// Out-of-bounds counts as blocked, so callers never range-check first.
    pub fn is_blocked(&self, x: i32, y: i32) -> bool {
        if !self.in_bounds(x, y) {
            return true;
        }
        self.blocked[(y * self.cols + x) as usize]
    }

    pub fn set_blocked(&mut self, x: i32, y: i32, blocked: bool) {
        if self.in_bounds(x, y) {
            let i = (y * self.cols + x) as usize;
            self.blocked[i] = blocked;
        }
    }
}

/// How a path is allowed to move between cells.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Movement {
    /// North, south, east, west.
    #[default]
    FourWay,
    /// Adds the diagonals, but only when both orthogonal neighbours are open,
    /// so a path never squeezes through the corner between two walls.
    EightWay,
}

#[derive(PartialEq)]
struct Node {
    estimate: f32,
    cost: f32,
    index: i32,
}

impl Eq for Node {}

impl Ord for Node {
    fn cmp(&self, other: &Self) -> Ordering {
        // BinaryHeap is a max-heap; invert so the cheapest estimate pops first.
        other
            .estimate
            .partial_cmp(&self.estimate)
            .unwrap_or(Ordering::Equal)
    }
}

impl PartialOrd for Node {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

const DIAGONAL: f32 = std::f32::consts::SQRT_2;

/// Shortest path from `start` to `goal`, inclusive of both, or `None` when no
/// route exists.
///
/// A blocked `goal` is unreachable by design: a bot asked to walk into a wall
/// should be told it cannot, not quietly routed next to it.
pub fn find_path(
    grid: &Grid,
    start: (i32, i32),
    goal: (i32, i32),
    movement: Movement,
) -> Option<Vec<(i32, i32)>> {
    if grid.is_blocked(start.0, start.1) || grid.is_blocked(goal.0, goal.1) {
        return None;
    }
    if start == goal {
        return Some(vec![start]);
    }

    let cols = grid.cols;
    let size = (grid.cols * grid.rows) as usize;
    let index_of = |x: i32, y: i32| y * cols + x;

    let mut cost = vec![f32::INFINITY; size];
    let mut came_from = vec![-1i32; size];
    let mut closed = vec![false; size];

    let heuristic = |x: i32, y: i32| {
        let dx = (x - goal.0).abs() as f32;
        let dy = (y - goal.1).abs() as f32;
        match movement {
            Movement::FourWay => dx + dy,
            // Octile distance: never overestimates, so A* stays optimal.
            Movement::EightWay => dx.max(dy) + (DIAGONAL - 1.0) * dx.min(dy),
        }
    };

    let start_index = index_of(start.0, start.1);
    let goal_index = index_of(goal.0, goal.1);
    cost[start_index as usize] = 0.0;

    let mut open = BinaryHeap::new();
    open.push(Node {
        estimate: heuristic(start.0, start.1),
        cost: 0.0,
        index: start_index,
    });

    while let Some(node) = open.pop() {
        if node.index == goal_index {
            return Some(reconstruct(&came_from, cols, goal_index));
        }
        // A cheaper route to this cell was already expanded.
        if closed[node.index as usize] {
            continue;
        }
        closed[node.index as usize] = true;

        let x = node.index % cols;
        let y = node.index / cols;

        for &(dx, dy, step) in neighbours(movement) {
            let (nx, ny) = (x + dx, y + dy);
            if grid.is_blocked(nx, ny) {
                continue;
            }
            // Refuse to cut a corner between two blocked cells.
            if dx != 0 && dy != 0 && (grid.is_blocked(x + dx, y) || grid.is_blocked(x, y + dy)) {
                continue;
            }

            let next = index_of(nx, ny);
            let tentative = node.cost + step;
            if tentative < cost[next as usize] {
                cost[next as usize] = tentative;
                came_from[next as usize] = node.index;
                open.push(Node {
                    estimate: tentative + heuristic(nx, ny),
                    cost: tentative,
                    index: next,
                });
            }
        }
    }

    None
}

fn neighbours(movement: Movement) -> &'static [(i32, i32, f32)] {
    const FOUR: [(i32, i32, f32); 4] = [(1, 0, 1.0), (-1, 0, 1.0), (0, 1, 1.0), (0, -1, 1.0)];
    const EIGHT: [(i32, i32, f32); 8] = [
        (1, 0, 1.0),
        (-1, 0, 1.0),
        (0, 1, 1.0),
        (0, -1, 1.0),
        (1, 1, DIAGONAL),
        (1, -1, DIAGONAL),
        (-1, 1, DIAGONAL),
        (-1, -1, DIAGONAL),
    ];
    match movement {
        Movement::FourWay => &FOUR,
        Movement::EightWay => &EIGHT,
    }
}

fn reconstruct(came_from: &[i32], cols: i32, goal: i32) -> Vec<(i32, i32)> {
    let mut path = vec![(goal % cols, goal / cols)];
    let mut cur = goal;
    while came_from[cur as usize] >= 0 {
        cur = came_from[cur as usize];
        path.push((cur % cols, cur / cols));
    }
    path.reverse();
    path
}

/// Drop waypoints that lie on a straight run between their neighbours.
///
/// A* returns one entry per cell, which makes a bot step like a chess piece.
/// Keeping only the corners lets it walk the same route in long strides.
pub fn simplify(path: &[(i32, i32)]) -> Vec<(i32, i32)> {
    if path.len() < 3 {
        return path.to_vec();
    }
    let mut out = vec![path[0]];
    for win in path.windows(3) {
        let (a, b, c) = (win[0], win[1], win[2]);
        if (b.0 - a.0, b.1 - a.1) != (c.0 - b.0, c.1 - b.1) {
            out.push(b);
        }
    }
    out.push(path[path.len() - 1]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a grid from ASCII art: '#' blocks, anything else is open.
    fn grid(rows: &[&str]) -> Grid {
        let cols = rows[0].len() as u32;
        let cells: Vec<char> = rows.iter().flat_map(|r| r.chars()).collect();
        Grid::from_cells(cols, rows.len() as u32, &cells, |c| *c == '#')
    }

    #[test]
    fn a_straight_corridor_is_walked_end_to_end() {
        let g = grid(&["....."]);
        let path = find_path(&g, (0, 0), (4, 0), Movement::FourWay).unwrap();
        assert_eq!(path, vec![(0, 0), (1, 0), (2, 0), (3, 0), (4, 0)]);
    }

    #[test]
    fn the_start_cell_is_its_own_path() {
        let g = grid(&["..", ".."]);
        assert_eq!(
            find_path(&g, (1, 1), (1, 1), Movement::FourWay),
            Some(vec![(1, 1)])
        );
    }

    #[test]
    fn a_wall_is_routed_around() {
        let g = grid(&[".....", ".###.", "....."]);
        let path = find_path(&g, (0, 1), (4, 1), Movement::FourWay).unwrap();
        assert_eq!(path.first(), Some(&(0, 1)));
        assert_eq!(path.last(), Some(&(4, 1)));
        assert!(
            path.iter().all(|&(x, y)| !g.is_blocked(x, y)),
            "path walked through a wall: {path:?}"
        );
    }

    #[test]
    fn a_sealed_room_has_no_path_out() {
        let g = grid(&["#####", "#.#.#", "#####"]);
        assert_eq!(find_path(&g, (1, 1), (3, 1), Movement::FourWay), None);
    }

    #[test]
    fn a_blocked_endpoint_is_unreachable() {
        let g = grid(&[".#."]);
        assert_eq!(find_path(&g, (0, 0), (1, 0), Movement::FourWay), None);
        assert_eq!(find_path(&g, (1, 0), (2, 0), Movement::FourWay), None);
    }

    #[test]
    fn out_of_bounds_counts_as_blocked() {
        let g = grid(&[".."]);
        assert!(g.is_blocked(-1, 0));
        assert!(g.is_blocked(0, 5));
        assert_eq!(find_path(&g, (0, 0), (9, 9), Movement::FourWay), None);
    }

    #[test]
    fn four_way_paths_never_move_diagonally() {
        let g = grid(&["....", "....", "....", "...."]);
        let path = find_path(&g, (0, 0), (3, 3), Movement::FourWay).unwrap();
        for step in path.windows(2) {
            let d = ((step[1].0 - step[0].0).abs(), (step[1].1 - step[0].1).abs());
            assert_eq!(d.0 + d.1, 1, "not an orthogonal step: {step:?}");
        }
        assert_eq!(path.len(), 7, "Manhattan distance is 6 steps");
    }

    #[test]
    fn eight_way_cuts_the_diagonal() {
        let g = grid(&["....", "....", "....", "...."]);
        let path = find_path(&g, (0, 0), (3, 3), Movement::EightWay).unwrap();
        assert_eq!(path, vec![(0, 0), (1, 1), (2, 2), (3, 3)]);
    }

    #[test]
    fn eight_way_refuses_to_squeeze_between_two_walls() {
        // Moving (0,0) -> (1,1) would slip through the corner where the two
        // walls touch, which no body with width could do.
        let g = grid(&[".#.", "#..", "..."]);
        let path = find_path(&g, (0, 0), (2, 2), Movement::EightWay);
        assert_eq!(path, None, "diagonal must not cut a sealed corner");
    }

    #[test]
    fn the_route_found_is_the_shortest_one() {
        // One wall with a single gap: the optimal path must use it.
        let g = grid(&["......", "####.#", "......"]);
        let path = find_path(&g, (0, 0), (0, 2), Movement::FourWay).unwrap();
        assert_eq!(path.len(), 11, "should thread the gap at x=4, got {path:?}");
    }

    #[test]
    fn simplify_keeps_only_the_corners() {
        let path = vec![(0, 0), (1, 0), (2, 0), (2, 1), (2, 2)];
        assert_eq!(simplify(&path), vec![(0, 0), (2, 0), (2, 2)]);
    }

    #[test]
    fn simplify_leaves_short_paths_alone() {
        assert_eq!(simplify(&[(0, 0)]), vec![(0, 0)]);
        assert_eq!(simplify(&[(0, 0), (1, 0)]), vec![(0, 0), (1, 0)]);
    }

    #[test]
    fn blocking_a_cell_reroutes_the_next_search() {
        let mut g = Grid::open(3, 3);
        let before = find_path(&g, (0, 1), (2, 1), Movement::FourWay).unwrap();
        assert_eq!(before.len(), 3);

        g.set_blocked(1, 1, true);
        let after = find_path(&g, (0, 1), (2, 1), Movement::FourWay).unwrap();
        assert!(after.len() > 3, "should detour, got {after:?}");
        assert!(!after.contains(&(1, 1)));
    }
}
