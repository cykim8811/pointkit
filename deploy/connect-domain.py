"""Connect the explicitly selected pointkit.dev zone; no token is written to disk."""
import subprocess,json,urllib.request,base64,copy

def get(*args):return json.loads(subprocess.check_output(['kubectl',*args]))
context=subprocess.check_output(['kubectl','config','current-context'],text=True).strip()
assert context=='gke_coders-497813_asia-northeast3-b_coders-prod-1','Select the intended GKE cluster.'
secret=get('-n','coders-system','get','secret','cloudflare-saas-token','-o','json')
token=base64.b64decode(secret['data']['api-token']).decode()
def cloudflare(method,path,body=None):
 request=urllib.request.Request('https://api.cloudflare.com/client/v4'+path,method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},data=None if body is None else json.dumps(body).encode())
 with urllib.request.urlopen(request,timeout=30) as response:result=json.load(response)
 assert result['success'],'Cloudflare request failed'
 return result['result']
zones=cloudflare('GET','/zones?name=pointkit.dev');assert len(zones)==1 and zones[0]['status']=='active','Pointkit zone must already be active.'
zone=zones[0]['id']
service=get('-n','kourier-system','get','service','kourier','-o','json')
ip=service['status']['loadBalancer']['ingress'][0]['ip']
records=cloudflare('GET',f'/zones/{zone}/dns_records?name=pointkit.dev')
addresses=[r for r in records if r['type'] in ('A','AAAA','CNAME')]
if addresses:
 assert len(addresses)==1 and addresses[0]['type']=='A' and addresses[0]['content']==ip,'Existing DNS differs; preserved without overwriting.'
else:cloudflare('POST',f'/zones/{zone}/dns_records',{'type':'A','name':'pointkit.dev','content':ip,'ttl':1,'proxied':True})
issuer=get('get','clusterissuer','letsencrypt-prod','-o','json')
acme=copy.deepcopy(issuer['spec']['acme'])
acme['privateKeySecretRef']={'name':'pointkit-letsencrypt-account'}
acme['solvers']=[{'dns01':{'cloudflare':{'apiTokenSecretRef':{'name':'cloudflare-saas-token','key':'api-token'}}}}]
resource={'apiVersion':'cert-manager.io/v1','kind':'Issuer','metadata':{'name':'pointkit-letsencrypt','namespace':'coders-system'},'spec':{'acme':acme}}
subprocess.run(['kubectl','apply','-f','-'],input=json.dumps(resource),text=True,check=True)
print('pointkit.dev DNS and certificate issuer configured.')
