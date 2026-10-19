from pathlib import Path
import hashlib, json, subprocess, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
root=Path(__file__).resolve().parents[2]
out=Path(__file__).resolve().parent
candidate=json.loads((out/'candidate.json').read_text())
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
url='https://fedemorlu24.github.io/gym-tracker/'
def read(name):
    req=urllib.request.Request(url+name+'?verify=v75-'+str(int(time.time())),headers={'Cache-Control':'no-cache'})
    with urllib.request.urlopen(req,timeout=25) as response:
        data=response.read(); digest=hashlib.sha256(data).hexdigest()
        return {'file':name,'status':response.status,'sha256':digest,'match':digest==candidate['sha256'][name]}
for attempt in range(20):
    build=json.loads(subprocess.check_output(['gh','api','repos/fedemorlu24/gym-tracker/pages/builds/latest'],text=True))
    print(json.dumps({'commit':build.get('commit'),'status':build.get('status')}),flush=True)
    if build.get('commit')==commit and build.get('status')=='built':
        with ThreadPoolExecutor(max_workers=5) as pool: files=list(pool.map(read,candidate['sha256']))
        if all(x['status']==200 and x['match'] for x in files):
            report={'commit':commit,'version':75,'url':url,'build':{k:build.get(k) for k in ['commit','status','created_at','updated_at','error']},'files':files,'pass':True}
            (out/'publication.json').write_text(json.dumps(report,indent=2)+'\n')
            (out/'deployed.json').write_text(json.dumps({'commit':commit,'version':75},indent=2)+'\n')
            print(f'PASS: Pages v75; all {len(files)} files return HTTP 200 and SHA-256 matches.',flush=True);break
        (out/'public-files-last.json').write_text(json.dumps(files,indent=2)+'\n')
        raise RuntimeError('Public file mismatch: '+str([x for x in files if not x['match'] or x['status']!=200]))
    if build.get('commit')==commit and build.get('status')=='errored': raise RuntimeError('Pages build failed')
    time.sleep(8)
else: raise RuntimeError('Pages build not verified within timeout')
