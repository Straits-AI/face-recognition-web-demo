/**
 * Chunk Loader - Reconstructs large ONNX models from chunks
 */

class ChunkLoader {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Load and reconstruct a chunked model
   * @param {string} basePath - Base path to chunk directory (e.g., 'public/models/adaface_chunks')
   * @param {function} progressCallback - Optional progress callback (loaded, total)
   * @returns {Promise<ArrayBuffer>} Reconstructed model data
   */
  async loadChunkedModel(basePath, progressCallback = null) {
    try {
      // Check cache first
      if (this.cache.has(basePath)) {
        console.log('Using cached chunked model:', basePath);
        return this.cache.get(basePath);
      }

      console.log('Loading chunked model metadata:', basePath);
      
      // Load metadata
      const metadataResponse = await fetch(`${basePath}/metadata.json`);
      if (!metadataResponse.ok) {
        throw new Error(`Failed to load metadata: ${metadataResponse.status}`);
      }
      
      const metadata = await metadataResponse.json();
      console.log(`Reconstructing ${metadata.originalFilename}: ${metadata.numChunks} chunks, ${(metadata.totalSize / 1024 / 1024).toFixed(2)}MB`);

      // Create array to hold all chunks
      const reconstructedData = new Uint8Array(metadata.totalSize);
      let loadedBytes = 0;

      // Load chunks in parallel with controlled concurrency
      const concurrency = 3; // Load 3 chunks at a time to avoid overwhelming the browser
      const chunkPromises = [];

      for (let i = 0; i < metadata.numChunks; i += concurrency) {
        const batch = metadata.chunks.slice(i, i + concurrency);
        
        const batchPromises = batch.map(async (chunkInfo) => {
          const chunkUrl = `${basePath}/${chunkInfo.filename}`;
          console.log(`Loading chunk ${chunkInfo.index}: ${chunkUrl}`);
          
          const response = await fetch(chunkUrl);
          if (!response.ok) {
            throw new Error(`Failed to load chunk ${chunkInfo.index}: ${response.status}`);
          }
          
          const chunkData = new Uint8Array(await response.arrayBuffer());
          
          // Verify chunk size
          if (chunkData.length !== chunkInfo.size) {
            throw new Error(`Chunk ${chunkInfo.index} size mismatch: expected ${chunkInfo.size}, got ${chunkData.length}`);
          }
          
          // Place chunk in correct position
          reconstructedData.set(chunkData, chunkInfo.offset);
          
          loadedBytes += chunkData.length;
          
          if (progressCallback) {
            progressCallback(loadedBytes, metadata.totalSize);
          }
          
          console.log(`Loaded chunk ${chunkInfo.index}: ${(chunkData.length / 1024 / 1024).toFixed(2)}MB`);
        });

        await Promise.all(batchPromises);
      }

      // Verify reconstruction
      if (reconstructedData.length !== metadata.totalSize) {
        throw new Error(`Size mismatch: expected ${metadata.totalSize}, got ${reconstructedData.length}`);
      }

      // Simple checksum verification
      const checksum = this.generateSimpleChecksum(reconstructedData);
      if (checksum !== metadata.checksum) {
        throw new Error(`Checksum mismatch: expected ${metadata.checksum}, got ${checksum}`);
      }

      console.log(`✅ Successfully reconstructed ${metadata.originalFilename}: ${(metadata.totalSize / 1024 / 1024).toFixed(2)}MB`);
      
      // Cache the result
      this.cache.set(basePath, reconstructedData.buffer);
      
      return reconstructedData.buffer;

    } catch (error) {
      console.error('Error loading chunked model:', error);
      throw error;
    }
  }

  /**
   * Generate simple checksum for verification
   * @param {Uint8Array} data 
   * @returns {string}
   */
  generateSimpleChecksum(data) {
    let checksum = 0;
    for (let i = 0; i < data.length; i += 1000) { // Sample every 1000 bytes for speed
      checksum = (checksum + data[i]) % 0xFFFFFF;
    }
    return checksum.toString(16);
  }

  /**
   * Check if a chunked model exists
   * @param {string} basePath 
   * @returns {Promise<boolean>}
   */
  async isChunkedModelAvailable(basePath) {
    try {
      const response = await fetch(`${basePath}/metadata.json`, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.log('Chunk loader cache cleared');
  }
}

// Create singleton instance
const chunkLoader = new ChunkLoader();

// Export for use in other modules
export { chunkLoader, ChunkLoader };