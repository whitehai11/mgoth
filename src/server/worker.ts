import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {env} from './lib/env.js';
import {logger} from './lib/logger.js';
import {readCatalog,syncCatalog} from './services/catalog.js';
import {reconcileSeeds} from './services/transmission.js';
const heartbeat=path.resolve(env.DATA_DIR,'worker.heartbeat');
async function run(){try{const result=await syncCatalog();logger.info(result,'Official release index synchronized');await reconcileSeeds();}catch(error){logger.error({error},'Synchronization worker run failed; cached site data remains available');}try{await mkdir(env.DATA_DIR,{recursive:true});await writeFile(heartbeat,new Date().toISOString(),{mode:0o640});}catch(error){logger.error({error},'Worker health heartbeat could not be written');}}
await run();
const timer=setInterval(()=>void run(),env.CATALOG_SYNC_HOURS*60*60_000);timer.unref();
const shutdown=async()=>{clearInterval(timer);logger.info({releases:(await readCatalog()).length},'Worker shutting down');process.exit(0);};
process.on('SIGTERM',()=>void shutdown());process.on('SIGINT',()=>void shutdown());
