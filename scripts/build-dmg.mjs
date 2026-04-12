import { execSync } from 'child_process';

// Generate build timestamp in YYYYMMDDHHmmss format (local time)
const now = new Date();
const timestamp = now.getFullYear().toString()
	+ String(now.getMonth() + 1).padStart(2, '0')
	+ String(now.getDate()).padStart(2, '0')
	+ String(now.getHours()).padStart(2, '0')
	+ String(now.getMinutes()).padStart(2, '0')
	+ String(now.getSeconds()).padStart(2, '0');

// Run electron-builder with custom artifact name including timestamp
execSync(
	`electron-builder --config.artifactName="\${productName}_${timestamp}.\${ext}"`,
	{ stdio: 'inherit' }
);
