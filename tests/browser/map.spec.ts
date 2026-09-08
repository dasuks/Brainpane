import { test, expect } from '@playwright/test';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startServer } from '../../src/server/server';

test('live publish, branch browsing, correction, reconnect, persistence and narrow window', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'brainpane-browser-'));
  let server = await startServer({ dataDir: dir, webDir: resolve('dist/web'), port: 0 });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const call = async (path: string, body?: unknown) => {
    const r = await fetch(`${server.origin}/api/${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${server.token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { code: r.status, body: await r.json() };
  };
  try {
    await page.goto(`${server.origin}/#access=${server.token}`);
    await expect(page.getByRole('heading', { name: '지금, 어느 이야기에 와 있나요?' })).toBeVisible();
    await promisify(execFile)(process.execPath, ['bin/brainpane.mjs', 'demo', '--session', 'demo', '--interval', '0', '--data', dir]);
    await page.getByLabel('대화 세션').selectOption('demo');
    await expect(page.locator('.current h1')).toHaveText('표시 방식과 가시성');
    await page.getByRole('button', { name: '전체 보기', exact: true }).click();
    await expect(page.getByTestId('topic-visibility')).toBeVisible();
    await page.getByTestId('topic-cost').click();
    await expect(page.locator('.detail h2')).toHaveText('지도 갱신의 토큰 부담');
    await page.getByLabel('현재 위치 추적').check();
    const viewportBefore = await page.locator('.react-flow__viewport').getAttribute('style');
    const positionsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('brainpane:view:demo')!).positions);
    const file = join(dir, 'live-patch.json');
    await writeFile(file, JSON.stringify({ updateId: 'after-browser', baseVersion: 8, operations: [
      { type: 'edit', topicId: 'visibility', changes: { summary: 'publish 명령에서 브라우저까지 실시간으로 도착했습니다.' } },
      { type: 'focus', topicId: 'compatibility', certainty: 'inferred', reason: null },
    ] }));
    await promisify(execFile)(process.execPath, ['bin/brainpane.mjs', 'publish', '--session', 'demo', '--file', file, '--data', dir]);
    await expect(page.locator('.current h1')).toHaveText('터미널 호환성');
    await expect(page.locator('.detail h2')).toHaveText('지도 갱신의 토큰 부담');
    expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(viewportBefore);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('brainpane:view:demo')!).positions)).toEqual(positionsBefore);
    await page.getByRole('button', { name: '수정', exact: true }).click();
    await page.getByLabel('주제 제목').fill('내가 정한 비용 이야기');
    await page.getByRole('button', { name: '수정 저장' }).click();
    await expect(page.locator('.detail h2')).toHaveText('내가 정한 비용 이야기');
    const rejected = await call('sessions/demo/publish', { updateId: 'bad-edit', baseVersion: 10, operations: [{ type: 'edit', topicId: 'cost', changes: { title: 'AI overwrite' } }] });
    expect(rejected.code).toBe(409); await expect(page.getByRole('alert')).toContainText('갱신 실패');
    await page.reload();
    await expect(page.locator('.detail h2')).toHaveText('내가 정한 비용 이야기');
    await expect(page.locator('.current h1')).toHaveText('터미널 호환성');
    await page.getByRole('button', { name: '대화에서 길을 잃지 않기 접기' }).click();
    await expect(page.getByText('이 가지 안에서 대화 중', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: '현재 대화로 돌아가기', exact: false }).click();
    await expect(page.locator('.detail h2')).toHaveText('터미널 호환성');
    await expect(page.getByTestId('topic-compatibility')).toBeVisible();
    await page.getByRole('button', { name: '지도 생성 중단', exact: true }).click();
    await expect(page.locator('.current')).toContainText('지도 생성 중단됨');
    const stopped = await call('sessions/demo/publish', { updateId: 'while-stopped', baseVersion: 11, operations: [{ type: 'edit', topicId: 'root', changes: { summary: 'should fail' } }] });
    expect(stopped.code).toBe(409);
    const port = Number(new URL(server.origin).port);
    await server.close();
    await expect(page.getByRole('status')).toContainText('연결 끊김');
    server = await startServer({ dataDir: dir, webDir: resolve('dist/web'), port });
    await expect(page.getByRole('status')).toContainText('실시간 연결');
    await expect(page.locator('.detail h2')).toHaveText('터미널 호환성');
    await expect(page.locator('.current')).toContainText('지도 생성 중단됨');
    await page.getByRole('button', { name: '지도 생성 재개' }).click();
    await expect(page.locator('.current')).not.toContainText('지도 생성 중단됨');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: '전체 보기', exact: true }).click();
    await page.screenshot({ path: 'test-results/brainpane-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.current h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.getByRole('button', { name: '현재 대화로 돌아가기', exact: false }).click();
    await page.screenshot({ path: 'test-results/brainpane-narrow.png', fullPage: true });
    expect(errors).toEqual([]);
    expect(JSON.parse(await readFile(join(dir, 'sessions/demo.json'), 'utf8')).topics.length).toBe(5);
  } finally { await page.close(); await server.close(); await rm(dir, { recursive: true, force: true }); }
});
