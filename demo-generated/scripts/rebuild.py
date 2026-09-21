"""重新生成已复核基线并验证；不会重新OCR或改动源文件。"""
from pathlib import Path
import sys,subprocess,hashlib,json,unittest,io
HERE=Path(__file__).resolve().parent;OUT=HERE.parent
from validate import source_integrity,run
source_integrity()
def generate():
 for script in ['reviewed_facts.py','analyze.py','build_mock.py','build_real_calibration_fixture.py','build_scenarios.py']:
  subprocess.run([sys.executable,str(HERE/script)],check=True)
def checksums():
 paths=[OUT/'source_inventory.json',OUT/'SAMPLE_ANALYSIS.md',OUT/'SCENARIO_COVERAGE.md',OUT/'reviewed-facts.json']+sorted((OUT/'mock').glob('*.json'))+sorted((OUT/'manifests').glob('*.json'))
 return {str(p.relative_to(OUT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
generate();first=checksums();generate();second=checksums()
if first!=second:raise RuntimeError('生成不确定，校验失败')
report=run();suite=unittest.defaultTestLoader.discover(str(OUT/'tests'));stream=io.StringIO();result=unittest.TextTestRunner(stream=stream,verbosity=2).run(suite)
(OUT/'test-results.txt').write_text(stream.getvalue());print(stream.getvalue())
report['tests']={'run':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'passed':result.wasSuccessful(),'report':'test-results.txt'}
report['repeatableGeneration']={'status':'PASS','filesCompared':len(first),'sha256':second}
report['sourceIntegrity']=source_integrity()
if not result.wasSuccessful():report['status']='FAIL'
(OUT/'validation-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
if not result.wasSuccessful():sys.exit(1)
