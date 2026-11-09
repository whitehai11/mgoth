import {createHmac,timingSafeEqual} from 'node:crypto';
import type {Request,Response,NextFunction} from 'express';
import {env} from './env.js';
const cookieName='mgoth_admin';
function constantTimeEqual(a:string,b:string){const left=Buffer.from(a);const right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
function signature(payload:string){return createHmac('sha256',env.SESSION_SECRET).update(payload).digest('base64url');}
export function createSession(){const payload=Buffer.from(JSON.stringify({exp:Date.now()+8*60*60*1000})).toString('base64url');return `${payload}.${signature(payload)}`;}
export function validSession(value:string){const [payload,sig]=value.split('.');if(!payload||!sig)return false;const expected=Buffer.from(signature(payload));const given=Buffer.from(sig);if(expected.length!==given.length||!timingSafeEqual(expected,given))return false;try{return (JSON.parse(Buffer.from(payload,'base64url').toString()) as {exp:number}).exp>Date.now();}catch{return false;}}
export function adminAuth(req:Request,res:Response,next:NextFunction){const auth=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):'';const cookie=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${cookieName}=`))?.slice(cookieName.length+1)??'';if(constantTimeEqual(auth,env.ADMIN_TOKEN)||validSession(cookie)){next();return;}res.status(401).json({error:'Authentication required'});}
export function setAdminCookie(res:Response){res.cookie(cookieName,createSession(),{httpOnly:true,secure:env.PUBLIC_BASE_URL.startsWith('https:'),sameSite:'strict',path:'/',maxAge:8*60*60*1000});}
