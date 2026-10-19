from pathlib import Path
import hashlib,json,subprocess,urllib.request
from concurrent.futures import ThreadPoolExecutor
out=Path(__file__).resolve().parent
candidate=json.loads((out/'candidate.json').read_text());commit=candidate['commit'];url='https://fedemorlu24.github.io/gym-tracker/'
build=json.loads(subprocess.check_output(['gh','api','repos/fedemorlu24/gym-tracker/pages/builds/latest'],text=True))
if build.get('commit')!=commit or build.get('status')!='built': raise RuntimeError('GitHub Pages build is not built for '+commit)
def read(name):
 req=urllib.request.Request(url+name+'?verify=v76',headers={'Cache-Control':'no-cache'})
 with urllib.request.urlopen(req,timeout=25) as r:
  data=r.read();digest=hashlib.sha256(data).hexdigest();return {'file':name,'status':r.status,'sha256':digest,'match':digest==candidate['sha256'][name]}
with ThreadPoolExecutor(max_workers=5) as pool: files=list(pool.map(read,candidate['sha256']))
if not all(x['status']==200 and x['match'] for x in files): raise RuntimeError('Public file mismatch: '+str([x for x in files if x['status']!=200 or not x['match']]))
report={'commit':commit,'version':76,'url':url,'build':{k:build.get(k) for k in ['commit','status','created_at','updated_at','error']},'files':files,'playwrightLive':'PASS; see live-smoke.json','pass':True}
(out/'publication.json').write_text(json.dumps(report,indent=2)+'\n');(out/'deployed.json').write_text(json.dumps({'commit':commit,'version':76},indent=2)+'\n')
print('PASS: Pages v76 build; all '+str(len(files))+' public asset SHA-256 hashes match.')
