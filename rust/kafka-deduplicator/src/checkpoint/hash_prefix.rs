use sha2::{Digest, Sha256};

/// Deterministic 8-character hex prefix for (topic, partition) to spread S3 object keys across partitions.
pub fn hash_prefix_for_partition(topic: &str, partition: i32) -> String {
    let input = format!("{topic}/{partition}");
    let hash = Sha256::digest(input.as_bytes());
    format!(
        "{:02x}{:02x}{:02x}{:02x}",
        hash[0], hash[1], hash[2], hash[3]
    )
}
