import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';

const projectId = 'demo-humanv1-workout-studio';
const configuredJava = process.env.JAVA_HOME;
const fallbackJava = 'C:\\Program Files\\Android\\Android Studio\\jbr';
const javaHome = configuredJava && existsSync(join(configuredJava, 'bin', 'java.exe')) ? configuredJava : fallbackJava;
if (!existsSync(join(javaHome, 'bin', 'java.exe'))) throw new Error('Java 21 is required for isolated browser emulators');
const shortTemp = resolve('.tmp-browser');
mkdirSync(shortTemp, { recursive: true });

const firebaseBin = join(process.cwd(), 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
const child = spawn(process.execPath, [firebaseBin, 'emulators:start', '--only', 'auth,firestore', '--project', projectId], {
  env: {
    ...process.env, JAVA_HOME: javaHome, TEMP: shortTemp, TMP: shortTemp,
    JAVA_TOOL_OPTIONS: `${process.env.JAVA_TOOL_OPTIONS ?? ''} -Djava.io.tmpdir=${shortTemp} -Djava.net.preferIPv4Stack=true`.trim(),
    PATH: `${join(javaHome, 'bin')}${delimiter}${process.env.PATH ?? ''}`,
  },
  stdio: 'inherit',
});
child.on('exit', code => process.exit(code ?? 1));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
