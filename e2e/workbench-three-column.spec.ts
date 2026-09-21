import {expect,test,type Page} from '@playwright/test';
async function open(page:Page) {
  await page.goto('/');await page.getByRole('button',{name:'Demo 控制台'}).click();
  await page.locator('.scenario-card').filter({hasText:'SC-08'}).click();
  await page.getByRole('button',{name:'当前核对任务'}).click();
}
test('完整字段、跨商品问题联动、真实 Excel 与 PDF 预览',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1600,height:1000});await open(page);
  await expect(page.locator('.metric-row')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'提交人工复核'})).toBeDisabled();
  await expect(page.locator('.recon-result-table thead th')).toHaveCount(26);
  await page.getByRole('button',{name:/执行首次匹配/}).click();
  await page.locator('.problem-center').getByRole('button',{name:/R008 · 数量/}).click();
  await expect(page.getByLabel('选择商品')).toHaveValue(/R008$/);
  await expect(page.locator('.evidence-context')).toContainText('当前字段：数量');
  await expect(page.locator('.preview-document .source-highlight')).toBeVisible();
  await page.locator('.evidence-entry').filter({hasText:'1765426942103.pdf'}).getByRole('button',{name:'定位到原文'}).click();
  await expect(page.getByLabel('PDF 原文件预览')).toBeVisible();
  await expect.poll(()=>page.locator('canvas').evaluate((c:HTMLCanvasElement)=>c.width)).toBeGreaterThan(400);
  await expect.poll(()=>page.locator('canvas').evaluate((c:HTMLCanvasElement)=>{const d=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=40)if(d[i+3]&&d[i]<200)n++;return n;})).toBeGreaterThan(50);
  await page.getByRole('button',{name:'25 列结果',exact:true}).click();
  await expect(page.locator('.recon-result-table thead th')).toHaveCount(26);
  await page.locator('.recon-result-table tbody tr').first().getByRole('button',{name:'4.2',exact:true}).click();
  await expect(page.locator('.evidence-context')).toContainText('R007 / 当前字段：毛重');
  await page.screenshot({path:info.outputPath('workbench-desktop.png'),fullPage:true});
  expect(errors).toEqual([]);
});
test('人工修正、锁定、历史、刷新和导出结果一致',async({page})=>{
  await open(page);await page.getByRole('button',{name:/执行首次匹配/}).click();
  await page.getByRole('button',{name:'字段核对',exact:true}).click();
  await page.getByRole('button',{name:'毛重',exact:true}).click();
  await page.getByLabel('处理原因').fill('以复核委托为准');
  await page.getByLabel('手动修改 毛重').fill('4.25');
  await page.getByRole('switch',{name:'保存后人工锁定'}).click();
  await page.getByRole('button',{name:'保存修改',exact:true}).click();
  await expect(page.locator('.human-record')).toContainText('以复核委托为准');
  await expect(page.getByLabel('人工锁定',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'历史',exact:true}).click();
  await expect(page.getByLabel('当前草稿版本与操作')).toContainText('4.2 → 4.25');
  await page.reload();await expect(page.locator('.recon-result-table')).toBeVisible();
  await page.getByRole('button',{name:'字段核对',exact:true}).click();
  await expect(page.getByLabel('手动修改 毛重')).toHaveValue('4.25');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出预览'}).click();
  expect((await download).suggestedFilename()).toContain('草稿预览');
});
test('窄屏抽屉和完整字段不产生页面横向溢出',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await open(page);
  await expect(page.locator('.recon-left')).toBeHidden();
  await page.getByRole('button',{name:/处理与问题/}).click();
  await expect(page.locator('.recon-left')).toBeVisible();
  await page.getByRole('button',{name:'关闭处理与问题'}).click();
  await page.getByRole('button',{name:'原文与证据',exact:true}).click();
  await expect(page.locator('.recon-right')).toBeVisible();
  await page.getByRole('button',{name:'关闭证据',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('workbench-mobile.png'),fullPage:true});
});
