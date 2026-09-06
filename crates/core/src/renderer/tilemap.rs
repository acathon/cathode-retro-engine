use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileLayer {
    pub name: String,
    pub sheet_handle: u32,
    pub tiles: Vec<u16>,
    pub fixed: bool,
    /// Tile ids that physics treats as walls. Empty means the layer is
    /// decoration only. Defaulted so tilemap JSON written before this
    /// existed still loads.
    #[serde(default)]
    pub solid_tiles: Vec<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileMap {
    pub name: String,
    pub cols: u32,
    pub rows: u32,
    pub tile_width: u32,
    pub tile_height: u32,
    pub layers: Vec<TileLayer>,
}

impl TileMap {
    pub fn new(name: String, cols: u32, rows: u32, tile_width: u32, tile_height: u32) -> Self {
        Self {
            name,
            cols,
            rows,
            tile_width,
            tile_height,
            layers: Vec::new(),
        }
    }

    pub fn add_layer(&mut self, name: String, sheet_handle: u32, fixed: bool) -> usize {
        let layer = TileLayer {
            name,
            sheet_handle,
            tiles: vec![0; (self.cols * self.rows) as usize],
            fixed,
            solid_tiles: Vec::new(),
        };
        self.layers.push(layer);
        self.layers.len() - 1
    }

    pub fn set_tile(&mut self, layer: usize, col: u32, row: u32, id: u16) {
        if layer < self.layers.len() && col < self.cols && row < self.rows {
            let idx = (row * self.cols + col) as usize;
            self.layers[layer].tiles[idx] = id;
        }
    }

    pub fn tile_at(&self, layer: usize, col: i32, row: i32) -> u16 {
        if col < 0 || row < 0 || col >= self.cols as i32 || row >= self.rows as i32 {
            return 0;
        }
        match self.layers.get(layer) {
            Some(l) => l.tiles[(row as u32 * self.cols + col as u32) as usize],
            None => 0,
        }
    }

    /// Mark which tile ids act as walls on a layer. Replaces any previous set.
    pub fn set_solid_tiles(&mut self, layer: usize, ids: &[u16]) {
        if let Some(l) = self.layers.get_mut(layer) {
            l.solid_tiles = ids.to_vec();
        }
    }

    /// Whether any layer declares walls. Physics skips maps that don't, so a
    /// purely decorative tilemap costs nothing.
    pub fn has_solid_tiles(&self) -> bool {
        self.layers.iter().any(|l| !l.solid_tiles.is_empty())
    }

    /// Whether the cell is a wall on any layer. Cells outside the map are
    /// open, so a body can walk or fall off the edge; add a border of solid
    /// tiles to close the level in.
    pub fn solid_at(&self, col: i32, row: i32) -> bool {
        if col < 0 || row < 0 || col >= self.cols as i32 || row >= self.rows as i32 {
            return false;
        }
        let idx = (row as u32 * self.cols + col as u32) as usize;
        self.layers
            .iter()
            .any(|l| !l.solid_tiles.is_empty() && l.solid_tiles.contains(&l.tiles[idx]))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map() -> TileMap {
        TileMap::new("level".to_string(), 4, 3, 8, 8)
    }

    #[test]
    fn a_new_map_has_no_layers() {
        let m = map();
        assert_eq!((m.cols, m.rows), (4, 3));
        assert!(m.layers.is_empty());
    }

    #[test]
    fn adding_a_layer_allocates_one_tile_per_cell() {
        let mut m = map();
        let idx = m.add_layer("bg".to_string(), 7, false);

        assert_eq!(idx, 0);
        assert_eq!(m.layers[0].tiles.len(), 12);
        assert!(m.layers[0].tiles.iter().all(|&t| t == 0), "starts empty");
        assert_eq!(m.layers[0].sheet_handle, 7);
        assert!(!m.layers[0].fixed);
    }

    #[test]
    fn layers_are_indexed_in_insertion_order() {
        let mut m = map();
        assert_eq!(m.add_layer("bg".to_string(), 0, false), 0);
        assert_eq!(m.add_layer("fg".to_string(), 1, true), 1);
        assert!(m.layers[1].fixed, "fixed layers ignore the camera");
    }

    #[test]
    fn set_tile_writes_in_row_major_order() {
        let mut m = map();
        let layer = m.add_layer("bg".to_string(), 0, false);

        m.set_tile(layer, 0, 0, 5);
        m.set_tile(layer, 3, 2, 9);

        assert_eq!(m.layers[layer].tiles[0], 5);
        assert_eq!(m.layers[layer].tiles[11], 9, "last cell of a 4x3 grid");
    }

    #[test]
    fn out_of_range_writes_are_ignored() {
        let mut m = map();
        let layer = m.add_layer("bg".to_string(), 0, false);

        m.set_tile(layer, 4, 0, 1); // column past the edge
        m.set_tile(layer, 0, 3, 1); // row past the edge
        m.set_tile(99, 0, 0, 1); // no such layer

        assert!(m.layers[layer].tiles.iter().all(|&t| t == 0));
    }

    #[test]
    fn a_map_survives_a_json_round_trip() {
        let mut m = map();
        let layer = m.add_layer("bg".to_string(), 2, true);
        m.set_tile(layer, 1, 1, 42);

        let json = serde_json::to_string(&m).unwrap();
        let restored: TileMap = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.name, "level");
        assert_eq!(restored.tile_width, 8);
        assert_eq!(restored.layers[0].tiles[5], 42);
        assert!(restored.layers[0].fixed);
    }
}
