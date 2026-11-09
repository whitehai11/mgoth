import {readFile} from 'node:fs/promises';
import {parseDocument} from 'yaml';
import assert from 'node:assert/strict';

const mainDoc=parseDocument(await readFile(new URL('../docker-compose.yml',import.meta.url),'utf8'),{uniqueKeys:true});
assert.equal(mainDoc.errors.length,0,mainDoc.errors.map(e=>e.message).join('\n'));
const compose=mainDoc.toJS();
assert.deepEqual(Object.keys(compose.services).sort(),['admin','web']);
assert.deepEqual(compose.services.web.ports,['127.0.0.1:8080:3000']);
assert.deepEqual(compose.services.admin.ports,['127.0.0.1:3001:3001']);
for(const service of Object.values(compose.services))assert.ok(service.healthcheck);
assert.deepEqual(compose.services.admin.networks,['admin-private']);
assert.ok(compose.networks['admin-private']);

const proxyDoc=parseDocument(await readFile(new URL('../deploy/docker-compose.proxy.yml',import.meta.url),'utf8'),{uniqueKeys:true});
assert.equal(proxyDoc.errors.length,0,proxyDoc.errors.map(e=>e.message).join('\n'));
const proxy=proxyDoc.toJS();
assert.ok(proxy.services.web.networks['reverse-proxy']);
assert.equal(proxy.networks['reverse-proxy'].external,true);
assert.ok(!proxy.services.admin,'Private administration must not join the reverse-proxy network.');
console.log('Compose YAML and deployment invariants are valid.');
