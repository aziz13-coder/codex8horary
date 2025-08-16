#!/usr/bin/env node
/**
 * Icon Validation Script for Horary Master
 * Validates that all icon files exist and are properly configured
 */

const fs = require('fs');
const path = require('path');

function validateIcons() {
    console.log('=== Icon Validation for Horary Master ===\n');
    
    const assetsDir = path.join(__dirname, 'assets');
    const requiredIcons = {
        'icon.ico': { platform: 'Windows', minSize: 1000, description: 'Windows executable and installer icon' },
        'icon.icns': { platform: 'macOS', minSize: 10000, description: 'macOS application bundle icon' },
        'icon.png': { platform: 'Linux', minSize: 1000, description: 'Linux application icon and fallback' }
    };
    
    let allValid = true;
    
    // Check if assets directory exists
    if (!fs.existsSync(assetsDir)) {
        console.error('✗ Assets directory not found:', assetsDir);
        return false;
    }
    console.log('✓ Assets directory found:', assetsDir);
    
    // Validate each required icon
    Object.entries(requiredIcons).forEach(([filename, config]) => {
        const iconPath = path.join(assetsDir, filename);
        
        if (!fs.existsSync(iconPath)) {
            console.error(`✗ Missing ${config.platform} icon: ${filename}`);
            allValid = false;
            return;
        }
        
        const stats = fs.statSync(iconPath);
        const sizeKB = Math.round(stats.size / 1024 * 10) / 10;
        
        if (stats.size < config.minSize) {
            console.warn(`⚠ ${config.platform} icon may be too small: ${filename} (${sizeKB}KB)`);
            console.warn(`  Expected at least ${Math.round(config.minSize/1024)}KB`);
        } else {
            console.log(`✓ ${config.platform} icon: ${filename} (${sizeKB}KB) - ${config.description}`);
        }
    });
    
    // Check package.json configuration
    console.log('\n=== Package.json Icon Configuration ===');
    
    try {
        const packagePath = path.join(__dirname, 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        const build = packageJson.build || {};
        
        // Check global icon
        if (build.icon) {
            console.log(`✓ Global icon configured: ${build.icon}`);
        } else {
            console.warn('⚠ No global icon configured in package.json');
        }
        
        // Check platform-specific icons
        if (build.win && build.win.icon) {
            console.log(`✓ Windows icon configured: ${build.win.icon}`);
        } else {
            console.warn('⚠ No Windows icon configured');
        }
        
        if (build.mac && build.mac.icon) {
            console.log(`✓ macOS icon configured: ${build.mac.icon}`);
        } else {
            console.warn('⚠ No macOS icon configured');
        }
        
        if (build.linux && build.linux.icon) {
            console.log(`✓ Linux icon configured: ${build.linux.icon}`);
        } else {
            console.warn('⚠ No Linux icon configured');
        }
        
        // Check NSIS installer icons
        if (build.nsis) {
            const nsis = build.nsis;
            if (nsis.installerIcon) {
                console.log(`✓ NSIS installer icon configured: ${nsis.installerIcon}`);
            }
            if (nsis.uninstallerIcon) {
                console.log(`✓ NSIS uninstaller icon configured: ${nsis.uninstallerIcon}`);
            }
        }
        
    } catch (error) {
        console.error('✗ Error reading package.json:', error.message);
        allValid = false;
    }
    
    // Check main.js configuration
    console.log('\n=== Main.js Icon Configuration ===');
    
    try {
        const mainPath = path.join(__dirname, 'main.js');
        const mainContent = fs.readFileSync(mainPath, 'utf8');
        
        if (mainContent.includes('icon:') && mainContent.includes('assets')) {
            console.log('✓ Icon configured in main.js');
            
            // Check if it uses platform-specific logic
            if (mainContent.includes('process.platform')) {
                console.log('✓ Platform-specific icon selection enabled');
            } else {
                console.warn('⚠ Icon selection is not platform-specific');
            }
        } else {
            console.warn('⚠ Icon not properly configured in main.js');
        }
        
    } catch (error) {
        console.error('✗ Error reading main.js:', error.message);
        allValid = false;
    }
    
    // Final summary
    console.log('\n=== Validation Summary ===');
    if (allValid) {
        console.log('🎉 All icon validations passed!');
        console.log('Your icons should work correctly in the packaged application.');
    } else {
        console.log('❌ Some icon issues were found.');
        console.log('Please fix the issues above before packaging.');
    }
    
    return allValid;
}

// Run validation if called directly
if (require.main === module) {
    const result = validateIcons();
    process.exit(result ? 0 : 1);
}

module.exports = { validateIcons };