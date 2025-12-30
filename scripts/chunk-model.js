#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const CHUNK_SIZE = 20 * 1024 * 1024; // 20MB chunks (well under 25MB limit)

function chunkModel(modelPath, outputDir) {
  console.log(`Chunking model: ${modelPath}`);
  
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Model file not found: ${modelPath}`);
  }
  
  const modelData = fs.readFileSync(modelPath);
  const totalSize = modelData.length;
  const numChunks = Math.ceil(totalSize / CHUNK_SIZE);
  
  console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
  console.log(`Creating ${numChunks} chunks of max ${(CHUNK_SIZE / 1024 / 1024).toFixed(1)}MB each`);
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Create chunks
  const chunks = [];
  for (let i = 0; i < numChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalSize);
    const chunk = modelData.subarray(start, end);
    
    const chunkFileName = `chunk_${i.toString().padStart(3, '0')}.bin`;
    const chunkPath = path.join(outputDir, chunkFileName);
    
    fs.writeFileSync(chunkPath, chunk);
    
    chunks.push({
      index: i,
      filename: chunkFileName,
      size: chunk.length,
      offset: start
    });
    
    console.log(`Created ${chunkFileName}: ${(chunk.length / 1024 / 1024).toFixed(2)}MB`);
  }
  
  // Create metadata file
  const metadata = {
    originalFilename: path.basename(modelPath),
    totalSize: totalSize,
    numChunks: numChunks,
    chunkSize: CHUNK_SIZE,
    chunks: chunks,
    checksum: generateSimpleChecksum(modelData)
  };
  
  const metadataPath = path.join(outputDir, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  
  console.log(`\nChunking complete!`);
  console.log(`Chunks saved to: ${outputDir}`);
  console.log(`Metadata: ${metadataPath}`);
  
  return metadata;
}

function generateSimpleChecksum(data) {
  let checksum = 0;
  for (let i = 0; i < data.length; i += 1000) { // Sample every 1000 bytes for speed
    checksum = (checksum + data[i]) % 0xFFFFFF;
  }
  return checksum.toString(16);
}

// CLI usage
if (require.main === module) {
  const modelPath = process.argv[2] || 'public/models/adaface_r50.onnx';
  const outputDir = process.argv[3] || 'public/models/adaface_chunks';
  
  try {
    chunkModel(modelPath, outputDir);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

module.exports = { chunkModel };