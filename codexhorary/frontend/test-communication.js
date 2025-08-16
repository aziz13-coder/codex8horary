#!/usr/bin/env node
/**
 * Communication Test Script for Horary Master
 * Tests frontend-backend communication in packaged environment
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

class CommunicationTester {
    constructor() {
        this.backendProcess = null;
        this.testResults = [];
        this.isPackaged = !process.defaultApp;
    }

    log(message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${message}`);
    }

    addResult(test, passed, details = '') {
        this.testResults.push({ test, passed, details });
        const status = passed ? '✓' : '✗';
        this.log(`${status} ${test}${details ? ': ' + details : ''}`);
    }

    async findBackendExecutable() {
        this.log('Looking for backend executable...');
        
        const executableName = process.platform === 'win32' ? 'horary_backend.exe' : 'horary_backend';
        const possiblePaths = [];

        if (this.isPackaged) {
            // Production paths
            possiblePaths.push(
                path.join(process.resourcesPath, 'backend', executableName),
                path.join(process.resourcesPath, 'app', 'backend', executableName),
                path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', executableName),
                path.join(__dirname, '..', 'app.asar.unpacked', 'backend', executableName),
                path.join(path.dirname(process.execPath), 'resources', 'backend', executableName),
                path.join(path.dirname(process.execPath), 'resources', 'app', 'backend', executableName),
                path.join(path.dirname(process.execPath), 'resources', 'app.asar.unpacked', 'backend', executableName),
            );
        } else {
            // Development paths
            possiblePaths.push(
                path.join(__dirname, '..', '..', 'backend', 'dist', executableName),
                path.join(__dirname, '..', 'backend', executableName),
                path.join(__dirname, 'backend', executableName)
            );
        }

        for (const exePath of possiblePaths) {
            this.log(`Checking: ${exePath}`);
            if (fs.existsSync(exePath)) {
                this.addResult('Backend executable found', true, exePath);
                return exePath;
            }
        }

        this.addResult('Backend executable found', false, 'No executable found in any expected location');
        return null;
    }

    async findBackendScript() {
        this.log('Looking for backend Python script...');
        
        const possiblePaths = [];

        if (this.isPackaged) {
            // Production paths
            possiblePaths.push(
                path.join(process.resourcesPath, 'backend'),
                path.join(process.resourcesPath, 'app', 'backend'),
                path.join(process.resourcesPath, 'app.asar.unpacked', 'backend'),
                path.join(__dirname, '..', 'app.asar.unpacked', 'backend'),
                path.join(path.dirname(process.execPath), 'resources', 'backend'),
                path.join(path.dirname(process.execPath), 'resources', 'app', 'backend'),
                path.join(path.dirname(process.execPath), 'resources', 'app.asar.unpacked', 'backend'),
            );
        } else {
            // Development paths
            possiblePaths.push(
                path.join(__dirname, '..', '..', 'backend'),
                path.join(__dirname, '..', 'backend'),
                path.join(__dirname, 'backend')
            );
        }

        for (const backendPath of possiblePaths) {
            const appScript = path.join(backendPath, 'app.py');
            this.log(`Checking: ${appScript}`);
            if (fs.existsSync(appScript)) {
                this.addResult('Backend script found', true, backendPath);
                return { path: backendPath, script: appScript };
            }
        }

        this.addResult('Backend script found', false, 'No app.py found in any expected location');
        return null;
    }

    async startBackend() {
        this.log('Starting backend process...');

        // Try executable first
        const executable = await this.findBackendExecutable();
        if (executable) {
            try {
                this.backendProcess = spawn(executable, [], {
                    stdio: 'pipe',
                    env: { ...process.env, PYTHONUNBUFFERED: '1' }
                });

                this.setupBackendHandlers('executable');
                return true;
            } catch (error) {
                this.addResult('Start backend executable', false, error.message);
            }
        }

        // Fallback to Python script
        const scriptInfo = await this.findBackendScript();
        if (scriptInfo) {
            try {
                this.backendProcess = spawn('python', [scriptInfo.script], {
                    cwd: scriptInfo.path,
                    stdio: 'pipe',
                    env: { ...process.env, PYTHONUNBUFFERED: '1' }
                });

                this.setupBackendHandlers('python script');
                return true;
            } catch (error) {
                this.addResult('Start backend script', false, error.message);
            }
        }

        return false;
    }

    setupBackendHandlers(type) {
        this.backendProcess.stdout.on('data', (data) => {
            this.log(`Backend stdout: ${data.toString().trim()}`);
        });

        this.backendProcess.stderr.on('data', (data) => {
            this.log(`Backend stderr: ${data.toString().trim()}`);
        });

        this.backendProcess.on('error', (error) => {
            this.addResult(`Backend ${type} error`, false, error.message);
        });

        this.backendProcess.on('exit', (code, signal) => {
            this.log(`Backend process exited with code ${code} and signal ${signal}`);
        });

        this.addResult(`Start backend ${type}`, true, `PID: ${this.backendProcess.pid}`);
    }

    async waitForBackend(timeout = 30000) {
        this.log('Waiting for backend to be ready...');
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                const response = await this.makeRequest('/api/health');
                if (response.status === 'healthy') {
                    this.addResult('Backend health check', true, `Ready in ${Date.now() - startTime}ms`);
                    return true;
                }
            } catch (error) {
                // Continue waiting
            }
            await this.sleep(1000);
        }

        this.addResult('Backend health check', false, 'Timeout waiting for backend');
        return false;
    }

    async makeRequest(endpoint, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'localhost',
                port: 5000,
                path: endpoint,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                }
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => {
                    body += chunk;
                });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        resolve(parsed);
                    } catch (error) {
                        resolve({ raw: body, statusCode: res.statusCode });
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (data) {
                req.write(JSON.stringify(data));
            }

            req.end();
        });
    }

    async testEndpoints() {
        this.log('Testing API endpoints...');

        // Test health endpoint
        try {
            const health = await this.makeRequest('/api/health');
            this.addResult('Health endpoint', health.status === 'healthy', JSON.stringify(health.enhanced_features || {}));
        } catch (error) {
            this.addResult('Health endpoint', false, error.message);
        }

        // Test version endpoint
        try {
            const version = await this.makeRequest('/api/version');
            this.addResult('Version endpoint', !!version.api_version, `v${version.api_version}`);
        } catch (error) {
            this.addResult('Version endpoint', false, error.message);
        }

        // Test timezone endpoint
        try {
            const timezone = await this.makeRequest('/api/get-timezone', 'POST', { location: 'London, UK' });
            this.addResult('Timezone endpoint', !!timezone.timezone, timezone.timezone || 'Failed');
        } catch (error) {
            this.addResult('Timezone endpoint', false, error.message);
        }

        // Test chart calculation (simple test)
        try {
            const chart = await this.makeRequest('/api/calculate-chart', 'POST', {
                question: 'Will this test pass?',
                location: 'London, UK',
                useCurrentTime: true
            });
            this.addResult('Chart calculation', !!chart.judgment, `${chart.judgment} (${chart.confidence}%)`);
        } catch (error) {
            this.addResult('Chart calculation', false, error.message);
        }
    }

    async stopBackend() {
        if (this.backendProcess) {
            this.log('Stopping backend process...');
            
            if (process.platform === 'win32') {
                try {
                    const { spawn } = require('child_process');
                    spawn('taskkill', ['/pid', this.backendProcess.pid, '/t', '/f'], {
                        stdio: 'ignore'
                    });
                } catch (error) {
                    this.backendProcess.kill('SIGKILL');
                }
            } else {
                this.backendProcess.kill('SIGTERM');
            }
            
            this.backendProcess = null;
            this.addResult('Stop backend', true);
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async runTests() {
        this.log('=== Horary Master Communication Test ===');
        this.log(`Environment: ${this.isPackaged ? 'Packaged' : 'Development'}`);
        this.log(`Platform: ${process.platform}`);
        this.log(`Process: ${process.execPath}`);
        this.log(`Resources: ${process.resourcesPath || 'N/A'}`);

        try {
            // Start backend
            const backendStarted = await this.startBackend();
            if (!backendStarted) {
                this.log('Failed to start backend, aborting tests');
                return this.generateReport();
            }

            // Wait for backend to be ready
            const backendReady = await this.waitForBackend();
            if (!backendReady) {
                await this.stopBackend();
                return this.generateReport();
            }

            // Test endpoints
            await this.testEndpoints();

            // Stop backend
            await this.stopBackend();

        } catch (error) {
            this.addResult('Test execution', false, error.message);
            await this.stopBackend();
        }

        return this.generateReport();
    }

    generateReport() {
        this.log('\n=== Test Results ===');
        
        const passed = this.testResults.filter(r => r.passed).length;
        const total = this.testResults.length;
        
        this.testResults.forEach(result => {
            const status = result.passed ? '✓' : '✗';
            console.log(`${status} ${result.test}${result.details ? ': ' + result.details : ''}`);
        });

        this.log(`\n=== Summary ===`);
        this.log(`Passed: ${passed}/${total} tests`);
        this.log(`Success rate: ${Math.round((passed / total) * 100)}%`);

        if (passed === total) {
            this.log('🎉 All tests passed! The packaged app should work correctly.');
        } else if (passed > total * 0.8) {
            this.log('⚠️  Most tests passed, but there may be minor issues.');
        } else {
            this.log('❌ Multiple tests failed. The packaged app may not work properly.');
        }

        return { passed, total, success: passed === total };
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new CommunicationTester();
    tester.runTests().then(result => {
        process.exit(result.success ? 0 : 1);
    }).catch(error => {
        console.error('Test runner error:', error);
        process.exit(1);
    });
}

module.exports = CommunicationTester;