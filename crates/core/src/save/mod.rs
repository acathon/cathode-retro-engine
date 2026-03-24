use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct SaveSlot {
    pub slot: u8,
    pub data: HashMap<String, serde_json::Value>,
}

impl SaveSlot {
    pub fn set<T: Serialize>(&mut self, key: &str, value: T) -> Result<(), serde_json::Error> {
        let v = serde_json::to_value(value)?;
        self.data.insert(key.to_string(), v);
        Ok(())
    }

    pub fn get<T: for<'de> Deserialize<'de>>(&self, key: &str) -> Option<T> {
        self.data
            .get(key)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
    }

    pub fn remove(&mut self, key: &str) {
        self.data.remove(key);
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{}".to_string())
    }

    pub fn from_json(s: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(s)
    }
}

pub struct SaveManager {
    slots: Vec<SaveSlot>,
}

impl Default for SaveManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SaveManager {
    pub fn new() -> Self {
        let mut slots = Vec::with_capacity(4);
        for i in 0..4 {
            slots.push(SaveSlot {
                slot: i,
                data: HashMap::new(),
            });
        }
        Self { slots }
    }

    pub fn save(&self, slot: u8) -> String {
        self.slot(slot).to_json()
    }

    pub fn load(&mut self, slot: u8, json: &str) -> Result<(), serde_json::Error> {
        let mut loaded = SaveSlot::from_json(json)?;
        loaded.slot = slot;
        if (slot as usize) < self.slots.len() {
            self.slots[slot as usize] = loaded;
        }
        Ok(())
    }

    pub fn slot(&self, idx: u8) -> &SaveSlot {
        &self.slots[(idx as usize).min(3)]
    }

    pub fn slot_mut(&mut self, idx: u8) -> &mut SaveSlot {
        &mut self.slots[(idx as usize).min(3)]
    }
}
