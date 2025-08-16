// Debug script to check paths in packaged app
const path = require('path');
const fs = require('fs');

console.log('=== Debug Path Information ===');
console.log('Current working directory:', process.cwd());
console.log('__dirname:', __dirname);
console.log('process.execPath:', process.execPath);
console.log('process.resourcesPath:', process.resourcesPath);
console.log('app.isPackaged:', !process.defaultApp);

console.log('\n=== Checking possible backend paths ===');

const possiblePaths = [
  path.join(__dirname, '..', 'backend'),
  path.join(__dirname, 'backend'),
  path.join(process.resourcesPath, 'backend'),
  path.join(process.resourcesPath, 'app', 'backend'),
  path.join(process.resourcesPath, 'app.asar.unpacked', 'backend'),
  path.join(__dirname, '..', 'app.asar.unpacked', 'backend'),
  path.join(__dirname, '..', '..', 'backend'),
  path.join(process.resourcesPath, '..', 'backend'),
  path.join(path.dirname(process.execPath), 'resources', 'backend'),
  path.join(path.dirname(process.execPath), 'resources', 'app', 'backend'),
  path.join(path.dirname(process.execPath), 'resources', 'app.asar.unpacked', 'backend'),
];

possiblePaths.forEach((backendPath, index) => {
  const appScript = path.join(backendPath, 'app.py');
  const exists = fs.existsSync(appScript);
  console.log(`${index + 1}. ${exists ? '✓' : '✗'} ${appScript}`);
  
  if (exists) {
    console.log(`   Found! Directory contents:`);
    try {
      const files = fs.readdirSync(backendPath);
      files.slice(0, 10).forEach(file => {
        console.log(`     - ${file}`);
      });
      if (files.length > 10) {
        console.log(`     ... and ${files.length - 10} more files`);
      }
    } catch (error) {
      console.log(`     Error reading directory: ${error.message}`);
    }
  }
});

console.log('\n=== Resources directory contents ===');
try {
  const resourcesContents = fs.readdirSync(process.resourcesPath);
  console.log('Resources directory:', process.resourcesPath);
  resourcesContents.forEach(item => {
    const itemPath = path.join(process.resourcesPath, item);
    const stats = fs.statSync(itemPath);
    console.log(`  ${stats.isDirectory() ? 'DIR ' : 'FILE'} ${item}`);
  });
} catch (error) {
  console.log('Error reading resources directory:', error.message);
}

console.log('\n=== Python executable test ===');
const { spawn } = require('child_process');

const pythonCommands = ['python', 'python3', 'python.exe'];
pythonCommands.forEach(cmd => {
  try {
    const result = spawn(cmd, ['--version'], { stdio: 'pipe' });
    result.on('close', (code) => {
      console.log(`${cmd}: ${code === 0 ? 'Available' : 'Not available'}`);
    });
    result.on('error', () => {
      console.log(`${cmd}: Not available`);
    });
  } catch (error) {
    console.log(`${cmd}: Error - ${error.message}`);
  }
});