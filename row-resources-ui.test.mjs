import test from 'node:test';
import assert from 'node:assert/strict';
import {resourceGroup,groupRowResources,publicWorkspaceCandidate} from './row-resources-ui.mjs';

test('group related materials without losing their identities or changing their data',()=>{
  const resources=[{id:'b',type:'assignment'},{id:'ppt',type:'presentation'},{id:'a',type:'assignment'},{id:'local',type:'tool'},{id:'private',type:'guide'}],before=structuredClone(resources);
  const groups=groupRowResources(resources);
  assert.deepEqual(groups.map(g=>g.id),['assignment','presentation','tool','guide']);
  assert.deepEqual(groups[0].resources.map(r=>r.id),['b','a']);assert.deepEqual(resources,before);
  assert.deepEqual(groupRowResources([]),[]);
});
test('own module pages differ from external sites; deceptive host names remain external',()=>{
  const web=url=>({type:'web',location:{kind:'https',url}});
  assert.equal(resourceGroup(web('https://miguitel.github.io/SR/UT03/SR03.html')),'notes');
  for(const url of ['https://example.org','https://miguitel.github.io.evil.test/SR','not a URL'])assert.equal(resourceGroup(web(url)),'web');
});
test('only safe public workspace paths may be checked; private and traversing paths never are',()=>{
  const local=path=>({location:{kind:'workspace',path}});
  const target=publicWorkspaceCandidate(local('repositorio/TAREAS/Guía 1.md'),'SR');
  assert.equal(target.url,'https://github.com/miGUITel/SR/blob/main/TAREAS/Gu%C3%ADa%201.md');
  assert.equal(target.path,'TAREAS/Guía 1.md');
  for(const path of ['SOLUCIONES/privado.md','repositorio/../secreto.md','repositorio/TAREAS/../../secreto.md','repositorio//a.md','repositorio/C:\\secreto.md','repositorio/a.md?token=x'])assert.equal(publicWorkspaceCandidate(local(path),'SR'),null);
  assert.equal(publicWorkspaceCandidate(local('repositorio/a.md'),'OTHER'),null);
});
