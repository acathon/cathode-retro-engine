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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn values_round_trip_through_a_slot() {
        let mut slot = SaveSlot::default();
        slot.set("level", 7u32).unwrap();
        slot.set("name", "hero").unwrap();
        slot.set("checkpoints", vec![1, 2, 3]).unwrap();

        assert_eq!(slot.get::<u32>("level"), Some(7));
        assert_eq!(slot.get::<String>("name"), Some("hero".to_string()));
        assert_eq!(slot.get::<Vec<i32>>("checkpoints"), Some(vec![1, 2, 3]));
    }

    #[test]
    fn missing_and_mistyped_keys_read_as_none() {
        let mut slot = SaveSlot::default();
        slot.set("level", 7u32).unwrap();
        assert_eq!(slot.get::<u32>("nope"), None);
        assert_eq!(slot.get::<Vec<String>>("level"), None, "wrong type");
    }

    #[test]
    fn setting_a_key_twice_overwrites_it() {
        let mut slot = SaveSlot::default();
        slot.set("score", 10u32).unwrap();
        slot.set("score", 99u32).unwrap();
        assert_eq!(slot.get::<u32>("score"), Some(99));
    }

    #[test]
    fn remove_deletes_a_key() {
        let mut slot = SaveSlot::default();
        slot.set("score", 10u32).unwrap();
        slot.remove("score");
        assert_eq!(slot.get::<u32>("score"), None);
        // Removing an absent key is harmless.
        slot.remove("score");
    }

    #[test]
    fn a_slot_survives_a_json_round_trip() {
        let mut slot = SaveSlot::default();
        slot.set("level", 3u32).unwrap();
        slot.set("hp", 42i32).unwrap();

        let restored = SaveSlot::from_json(&slot.to_json()).unwrap();
        assert_eq!(restored.get::<u32>("level"), Some(3));
        assert_eq!(restored.get::<i32>("hp"), Some(42));
    }

    #[test]
    fn malformed_json_is_reported_as_an_error() {
        assert!(SaveSlot::from_json("{not json").is_err());
    }

    #[test]
    fn a_manager_starts_with_four_independent_slots() {
        let mut mgr = SaveManager::new();
        for i in 0..4u8 {
            mgr.slot_mut(i).set("id", i).unwrap();
        }
        for i in 0..4u8 {
            assert_eq!(mgr.slot(i).get::<u8>("id"), Some(i));
        }
    }

    #[test]
    fn out_of_range_slots_clamp_to_the_last_one() {
        let mut mgr = SaveManager::new();
        mgr.slot_mut(3).set("marker", true).unwrap();
        assert_eq!(mgr.slot(200).get::<bool>("marker"), Some(true));
    }

    #[test]
    fn exporting_and_importing_moves_data_between_slots() {
        let mut mgr = SaveManager::new();
        mgr.slot_mut(0).set("coins", 25u32).unwrap();

        let json = mgr.save(0);
        mgr.load(2, &json).unwrap();

        assert_eq!(mgr.slot(2).get::<u32>("coins"), Some(25));
        assert_eq!(mgr.slot(2).slot, 2, "the slot index is retagged on load");
        assert_eq!(mgr.slot(1).get::<u32>("coins"), None, "others untouched");
    }

    #[test]
    fn loading_malformed_json_leaves_the_slot_alone() {
        let mut mgr = SaveManager::new();
        mgr.slot_mut(0).set("coins", 25u32).unwrap();
        assert!(mgr.load(0, "garbage").is_err());
        assert_eq!(mgr.slot(0).get::<u32>("coins"), Some(25));
    }
}
