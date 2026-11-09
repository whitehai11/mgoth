import express from 'express';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import {adminApi} from './routes/api.js';
import {env} from './lib/env.js';
import {logger} from './lib/logger.js';
const app=express();app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'none'"],frameAncestors:["'none'"],baseUri:["'none'"]}}}));app.use(express.json({limit:'32kb'}));app.use('/login',rateLimit({windowMs:15*60_000,limit:8,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many attempts; try again later.'}}));app.get('/health',(_req,res)=>res.json({status:'ok'}));app.use('/',adminApi);app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{logger.error({err},'Unhandled private administration request error');res.status(500).json({error:'Internal server error'});});
const server=app.listen(env.ADMIN_PORT,'0.0.0.0',()=>logger.info({port:env.ADMIN_PORT},'Private administration API listening'));
function shutdown(){server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10_000).unref();}process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
