import {Router} from 'express';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {adminAuth,setAdminCookie} from '../lib/auth.js';
import {env} from '../lib/env.js';
import {logger} from '../lib/logger.js';
import {createOAuthState,exchangeCode,getSnapshot,spotifyAuthorizationUrl,spotifyConfigured,verifyOAuthState} from '../services/spotify.js';

export const publicApi=Router();
export const adminApi=Router();
const originOk=(origin:string|undefined)=>!origin||origin===env.PUBLIC_BASE_URL||origin.startsWith('http://localhost:')||origin.startsWith('http://127.0.0.1:');
const sameSecret=(a:string,b:string)=>{const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);};

publicApi.get('/health',(_req,res)=>res.json({status:'ok',timestamp:new Date().toISOString()}));
publicApi.get('/spotify',async(_req,res)=>{res.set('Cache-Control','public, max-age=15, stale-while-revalidate=15');res.json(await getSnapshot());});
publicApi.get('/spotify/callback',async(req,res)=>{
 const state=typeof req.query.state==='string'?req.query.state:'';const code=typeof req.query.code==='string'?req.query.code:'';
 if(!verifyOAuthState(state)||!code){logger.warn('Spotify OAuth callback rejected');return res.redirect(`${env.PUBLIC_BASE_URL}/?spotify=error`);}
 try{await exchangeCode(code);res.redirect(`${env.PUBLIC_BASE_URL}/?spotify=connected`);}catch(error){logger.error({error},'Spotify OAuth exchange failed');res.redirect(`${env.PUBLIC_BASE_URL}/?spotify=error`);}
});

adminApi.post('/login',async(req,res)=>{if(!originOk(req.get('origin')))return res.status(403).json({error:'Origin rejected'});const password=z.string().min(1).max(512).safeParse(req.body?.password);if(!password.success||!sameSecret(password.data,env.ADMIN_TOKEN))return res.status(401).json({error:'Invalid credentials'});setAdminCookie(res);res.json({authenticated:true});});
adminApi.post('/logout',adminAuth,(_req,res)=>{res.clearCookie('mgoth_admin',{path:'/'});res.status(204).end();});
adminApi.get('/spotify/connect',adminAuth,(_req,res)=>{if(!spotifyConfigured())return res.status(409).json({error:'Spotify client credentials are not configured'});res.json({url:spotifyAuthorizationUrl(createOAuthState())});});
adminApi.get('/status',adminAuth,async(_req,res)=>{const snapshot=await getSnapshot(true);res.json({spotify:{connected:snapshot.connected,status:snapshot.status}});});
