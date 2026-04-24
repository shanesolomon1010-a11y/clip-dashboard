import fs from 'fs';
import path from 'path';

export const CREATIVELAUNCH_FRAMEWORK = fs.readFileSync(
  path.join(process.cwd(), 'src/lib/creativelaunch-framework.txt'),
  'utf-8'
);
