"""Verify saved artifacts against model-emitted patches in the host log extract."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / 'demo-generated/real-calibration/SC-08-audit'

def verify():
    evidence = json.loads((AUDIT/'execution-evidence.json').read_text())
    assert any(r.get('model')=='gpt-5.6-sol' for r in evidence['records'])
    # When the original host log is still present, independently compare its lines.
    log=Path(evidence['source_log'])
    if log.exists():
        assert hashlib.sha256(log.read_bytes()).hexdigest()==evidence['source_log_sha256']
        lines=log.read_text().splitlines()
        for record in evidence['records']:
            if record['kind']=='model_tool_call':
                payload=json.loads(lines[record['line']-1])['payload']
                assert record['input']==payload.get('arguments',payload.get('input'))
    files={}
    generated=[]
    for record in evidence['records']:
        code=record.get('input','')
        if 'const patch =' not in code: continue
        patch=json.JSONDecoder().raw_decode(code.split('const patch =',1)[1].lstrip())[0]
        blocks=patch.split('*** ')
        for block in blocks:
            if not block.startswith(('Add File:','Update File:')): continue
            header,*body=block.splitlines();name=Path(header.split(': ',1)[1]).name
            if not name.startswith(('P1-','P2-','P3-','P4-')): continue
            if header.startswith('Add File:'):
                files[name]='\n'.join(line[1:] for line in body if line.startswith('+'))+'\n'
                generated.append(name)
            else:
                hunks='\n'.join(body).split('@@')
                for hunk in hunks:
                    lines=[l for l in hunk.splitlines() if l.startswith((' ','+','-'))]
                    old='\n'.join(l[1:] for l in lines if not l.startswith('+'))
                    new='\n'.join(l[1:] for l in lines if not l.startswith('-'))
                    if old:
                        assert old in files[name], 'Missing patch context'
                        files[name]=files[name].replace(old,new,1)
    expected=[f'{s}-{kind}.json' for s in ['P1','P2','P3','P4'] for kind in ['request','response']]
    assert generated==expected, 'Stages not generated in P1 → P2 → P3 → P4 order'
    for name in expected:
        assert json.loads(files[name])==json.loads((AUDIT/name).read_text()), f'Model log mismatch: {name}'
    print('Sol host model, stage order and all 8 artifact contents verified against model-emitted patches')
    return evidence

if __name__=='__main__': verify()
