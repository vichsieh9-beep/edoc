import { spawn } from 'node:child_process';
const filters={store:'collaboration-store',permissions:'collaboration-api',suggestions:'suggestions-api',publication:'publication-recovery'};
const files=process.argv[2]?[filters[process.argv[2]]||process.argv[2]]:['collaboration-store','collaboration-api','suggestions-api','publication-recovery'];
const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test',...files.map(n=>`tests/${n}.spec.js`),'--project=chromium','--workers=1'],{stdio:'inherit'});
child.on('exit',code=>process.exit(code??1));
