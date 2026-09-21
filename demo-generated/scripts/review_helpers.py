from pathlib import Path
import json
from PIL import Image,ImageOps,ImageDraw
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'demo-generated'
def docs():return [json.loads(p.read_text()) for p in sorted((OUT/'extracted').glob('F-*.json'))]
def contact(sample,role='inspection'):
 pages=[]
 for d in docs():
  if d['sampleId']==sample and d['role']==role:
   for p in d.get('pages',[]):pages.append((d,p))
 outputs=[]
 for start in range(0,len(pages),4):
  selected=pages[start:start+4]; canvas=Image.new('RGB',(2000,1500*((len(selected)+1)//2)),'#ddd');draw=ImageDraw.Draw(canvas)
  for j,(d,p) in enumerate(selected):
   im=Image.open(ROOT/p['renderPath']).convert('RGB'); im.thumbnail((990,1440))
   x=(j%2)*1000;y=(j//2)*1500
   canvas.paste(im,(x,y+40));draw.text((x+10,y+5),f"{d['id']} p{p['page']} / {Path(d['path']).name}",fill='black')
  dest=OUT/'renders'/f"review-{sample}-{role}-{start//4}.jpg";canvas.save(dest);outputs.append(str(dest))
 return outputs
if __name__=='__main__':
 import sys
 print('\n'.join(contact(sys.argv[1],sys.argv[2] if len(sys.argv)>2 else 'inspection')))
