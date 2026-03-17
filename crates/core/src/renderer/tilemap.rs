use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileLayer {
    pub name: String,
    pub sheet_handle: u32,
    pub tiles: Vec<u16>,
    pub fixed: bool,
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
}
