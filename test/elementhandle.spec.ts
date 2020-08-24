/**
 * Copyright 2018 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import expect from 'expect';
import sinon from 'sinon';
import {
  getTestState,
  setupTestBrowserHooks,
  setupTestPageAndContextHooks,
  describeFailsFirefox,
  itFailsFirefox,
} from './mocha-utils'; // eslint-disable-line import/extensions

import utils from './utils.js';
import { ElementHandle } from '../lib/cjs/puppeteer/common/JSHandle.js';
import { Page } from '../lib/cjs/puppeteer/common/Page.js';

describe('ElementHandle specs', function () {
  setupTestBrowserHooks();
  setupTestPageAndContextHooks();

  describeFailsFirefox('ElementHandle.boundingBox', function () {
    it('should work', async () => {
      const { page, server } = getTestState();

      await page.setViewport({ width: 500, height: 500 });
      await page.goto(server.PREFIX + '/grid.html');
      const elementHandle = await page.$('.box:nth-of-type(13)');
      const box = await elementHandle.boundingBox();
      expect(box).toEqual({ x: 100, y: 50, width: 50, height: 50 });
    });
    it('should handle nested frames', async () => {
      const { page, server, isChrome } = getTestState();

      await page.setViewport({ width: 500, height: 500 });
      await page.goto(server.PREFIX + '/frames/nested-frames.html');
      const nestedFrame = page.frames()[1].childFrames()[1];
      const elementHandle = await nestedFrame.$('div');
      const box = await elementHandle.boundingBox();
      if (isChrome)
        expect(box).toEqual({ x: 28, y: 182, width: 264, height: 18 });
      else expect(box).toEqual({ x: 28, y: 182, width: 254, height: 18 });
    });
    it('should return null for invisible elements', async () => {
      const { page } = getTestState();

      await page.setContent('<div style="display:none">hi</div>');
      const element = await page.$('div');
      expect(await element.boundingBox()).toBe(null);
    });
    it('should force a layout', async () => {
      const { page } = getTestState();

      await page.setViewport({ width: 500, height: 500 });
      await page.setContent(
        '<div style="width: 100px; height: 100px">hello</div>'
      );
      const elementHandle = await page.$('div');
      await page.evaluate<(element: HTMLElement) => void>(
        (element) => (element.style.height = '200px'),
        elementHandle
      );
      const box = await elementHandle.boundingBox();
      expect(box).toEqual({ x: 8, y: 8, width: 100, height: 200 });
    });
    it('should work with SVG nodes', async () => {
      const { page } = getTestState();

      await page.setContent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">
          <rect id="theRect" x="30" y="50" width="200" height="300"></rect>
        </svg>
      `);
      const element = await page.$('#therect');
      const pptrBoundingBox = await element.boundingBox();
      const webBoundingBox = await page.evaluate((e: HTMLElement) => {
        const rect = e.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }, element);
      expect(pptrBoundingBox).toEqual(webBoundingBox);
    });
  });

  describeFailsFirefox('ElementHandle.boxModel', function () {
    it('should work', async () => {
      const { page, server } = getTestState();

      await page.goto(server.PREFIX + '/resetcss.html');

      // Step 1: Add Frame and position it absolutely.
      await utils.attachFrame(page, 'frame1', server.PREFIX + '/resetcss.html');
      await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>('#frame1');
        frame.style.position = 'absolute';
        frame.style.left = '1px';
        frame.style.top = '2px';
      });

      // Step 2: Add div and position it absolutely inside frame.
      const frame = page.frames()[1];
      const divHandle = (
        await frame.evaluateHandle(() => {
          const div = document.createElement('div');
          document.body.appendChild(div);
          div.style.boxSizing = 'border-box';
          div.style.position = 'absolute';
          div.style.borderLeft = '1px solid black';
          div.style.paddingLeft = '2px';
          div.style.marginLeft = '3px';
          div.style.left = '4px';
          div.style.top = '5px';
          div.style.width = '6px';
          div.style.height = '7px';
          return div;
        })
      ).asElement();

      // Step 3: query div's boxModel and assert box values.
      const box = await divHandle.boxModel();
      expect(box.width).toBe(6);
      expect(box.height).toBe(7);
      expect(box.margin[0]).toEqual({
        x: 1 + 4, // frame.left + div.left
        y: 2 + 5,
      });
      expect(box.border[0]).toEqual({
        x: 1 + 4 + 3, // frame.left + div.left + div.margin-left
        y: 2 + 5,
      });
      expect(box.padding[0]).toEqual({
        x: 1 + 4 + 3 + 1, // frame.left + div.left + div.marginLeft + div.borderLeft
        y: 2 + 5,
      });
      expect(box.content[0]).toEqual({
        x: 1 + 4 + 3 + 1 + 2, // frame.left + div.left + div.marginLeft + div.borderLeft + dif.paddingLeft
        y: 2 + 5,
      });
    });

    it('should return null for invisible elements', async () => {
      const { page } = getTestState();

      await page.setContent('<div style="display:none">hi</div>');
      const element = await page.$('div');
      expect(await element.boxModel()).toBe(null);
    });
  });

  describe('ElementHandle.contentFrame', function () {
    itFailsFirefox('should work', async () => {
      const { page, server } = getTestState();

      await page.goto(server.EMPTY_PAGE);
      await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE);
      const elementHandle = await page.$('#frame1');
      const frame = await elementHandle.contentFrame();
      expect(frame).toBe(page.frames()[1]);
    });
  });

  describe('ElementHandle.click', function () {
    it('should work', async () => {
      const { page, server } = getTestState();

      await page.goto(server.PREFIX + '/input/button.html');
      const button = await page.$('button');
      await button.click();
      expect(await page.evaluate(() => globalThis.result)).toBe('Clicked');
    });
    it('should work for Shadow DOM v1', async () => {
      const { page, server } = getTestState();

      await page.goto(server.PREFIX + '/shadow.html');
      const buttonHandle = await page.evaluateHandle<ElementHandle>(
        // @ts-expect-error button is expected to be in the page's scope.
        () => button
      );
      await buttonHandle.click();
      expect(
        await page.evaluate(
          // @ts-expect-error clicked is expected to be in the page's scope.
          () => clicked
        )
      ).toBe(true);
    });
    it('should work for TextNodes', async () => {
      const { page, server } = getTestState();

      await page.goto(server.PREFIX + '/input/button.html');
      const buttonTextNode = await page.evaluateHandle(
        () => document.querySelector('button').firstChild
      );
      let error = null;
      // @ts-expect-error
      await buttonTextNode.click().catch((error_) => (error = error_));
      expect(error.message).toBe('Node is not of type HTMLElement');
    });
    it('should throw for detached nodes', async () => {
      const { page, server } = getTestState();

      await page.goto(server.PREFIX + '/input/button.html');
      const button = await page.$('button');
      await page.evaluate((button: HTMLElement) => button.remove(), button);
      let error = null;
      await button.click().catch((error_) => (error = error_));
      expect(error.message).toBe('Node is detached from document');
    });
    it('should throw for hidden nodes', async () => {
      const { page, server } = getTestState();

      await page.goto(server.PREFIX + '/input/button.html');
      const button = await page.$('button');
      await page.evaluate(
        (button: HTMLElement) => (button.style.display = 'none'),
        button
      );
      const error = await button.click().catch((error_) => error_);
      expect(error.message).toBe(
        'Node is either not visible or not an HTMLElement'
      );
    });
    it('should throw for recursively hidden nodes', async () => {
      const { page, server } = getTestState();

      await page.goto(server.PREFIX + '/input/button.html');
      const button = await page.$('button');
      await page.evaluate(
        (button: HTMLElement) => (button.parentElement.style.display = 'none'),
        button
      );
      const error = await button.click().catch((error_) => error_);
      expect(error.message).toBe(
        'Node is either not visible or not an HTMLElement'
      );
    });
    it('should throw for <br> elements', async () => {
      const { page } = getTestState();

      await page.setContent('hello<br>goodbye');
      const br = await page.$('br');
      const error = await br.click().catch((error_) => error_);
      expect(error.message).toBe(
        'Node is either not visible or not an HTMLElement'
      );
    });
  });

  describe('ElementHandle.hover', function () {
    itFailsFirefox('should work', async () => {
      const { page, server } = getTestState();

      await page.goto(server.PREFIX + '/input/scrollable.html');
      const button = await page.$('#button-6');
      await button.hover();
      expect(
        await page.evaluate(() => document.querySelector('button:hover').id)
      ).toBe('button-6');
    });
  });

  describe('ElementHandle.isIntersectingViewport', function () {
    it('should work', async () => {
      const { page, server } = getTestState();

      await page.goto(server.PREFIX + '/offscreenbuttons.html');
      for (let i = 0; i < 11; ++i) {
        const button = await page.$('#btn' + i);
        // All but last button are visible.
        const visible = i < 10;
        expect(await button.isIntersectingViewport()).toBe(visible);
      }
    });
  });

  describe('Custom queries', function () {
    this.afterEach(() => {
      const { puppeteer } = getTestState();
      puppeteer.__experimental_clearQueryHandlers();
    });
    it('should register and unregister', async () => {
      const { page, puppeteer } = getTestState();
      await page.setContent('<div id="not-foo"></div><div id="foo"></div>');

      // Register.
      puppeteer.__experimental_registerCustomQueryHandler('getById', {
        queryOne: (element, selector) =>
          document.querySelector(`[id="${selector}"]`),
      });
      const element = await page.$('getById/foo');
      expect(
        await page.evaluate<(element: HTMLElement) => string>(
          (element) => element.id,
          element
        )
      ).toBe('foo');

      // Unregister.
      puppeteer.__experimental_unregisterCustomQueryHandler('getById');
      try {
        await page.$('getById/foo');
        throw new Error('Custom query handler name not set - throw expected');
      } catch (error) {
        expect(error).toStrictEqual(
          new Error(
            'Query set to use "getById", but no query handler of that name was found'
          )
        );
      }
    });
    it('should throw with invalid query names', () => {
      try {
        const { puppeteer } = getTestState();
        puppeteer.__experimental_registerCustomQueryHandler(
          '1/2/3',
          // @ts-expect-error
          () => {}
        );
        throw new Error(
          'Custom query handler name was invalid - throw expected'
        );
      } catch (error) {
        expect(error).toStrictEqual(
          new Error('Custom query handler names may only contain [a-zA-Z]')
        );
      }
    });
    it('should work for multiple elements', async () => {
      const { page, puppeteer } = getTestState();
      await page.setContent(
        '<div id="not-foo"></div><div class="foo">Foo1</div><div class="foo baz">Foo2</div>'
      );
      puppeteer.__experimental_registerCustomQueryHandler('getByClass', {
        queryAll: (element, selector) =>
          document.querySelectorAll(`.${selector}`),
      });
      const elements = await page.$$('getByClass/foo');
      const classNames = await Promise.all(
        elements.map(
          async (element) =>
            await page.evaluate<(element: HTMLElement) => string>(
              (element) => element.className,
              element
            )
        )
      );

      expect(classNames).toStrictEqual(['foo', 'foo baz']);
    });
    it('should eval correctly', async () => {
      const { page, puppeteer } = getTestState();
      await page.setContent(
        '<div id="not-foo"></div><div class="foo">Foo1</div><div class="foo baz">Foo2</div>'
      );
      puppeteer.__experimental_registerCustomQueryHandler('getByClass', {
        queryAll: (element, selector) =>
          document.querySelectorAll(`.${selector}`),
      });
      const elements = await page.$$eval(
        'getByClass/foo',
        (divs) => divs.length
      );

      expect(elements).toBe(2);
    });
    it('should wait correctly with waitForSelector', async () => {
      const { page, puppeteer } = getTestState();
      puppeteer.__experimental_registerCustomQueryHandler('getByClass', {
        queryOne: (element, selector) => element.querySelector(`.${selector}`),
      });
      const waitFor = page.waitForSelector('getByClass/foo');

      // Set the page content after the waitFor has been started.
      await page.setContent(
        '<div id="not-foo"></div><div class="foo">Foo1</div>'
      );
      const element = await waitFor;

      expect(element).toBeDefined();
    });

    it('should wait correctly with waitFor', async () => {
      /* page.waitFor is deprecated so we silence the warning to avoid test noise */
      sinon.stub(console, 'warn').callsFake(() => {});
      const { page, puppeteer } = getTestState();
      puppeteer.__experimental_registerCustomQueryHandler('getByClass', {
        queryOne: (element, selector) => element.querySelector(`.${selector}`),
      });
      const waitFor = page.waitFor('getByClass/foo');

      // Set the page content after the waitFor has been started.
      await page.setContent(
        '<div id="not-foo"></div><div class="foo">Foo1</div>'
      );
      const element = await waitFor;

      expect(element).toBeDefined();
    });
    it('should work when both queryOne and queryAll are registered', async () => {
      const { page, puppeteer } = getTestState();
      await page.setContent(
        '<div id="not-foo"></div><div class="foo"><div id="nested-foo" class="foo"/></div><div class="foo baz">Foo2</div>'
      );
      puppeteer.__experimental_registerCustomQueryHandler('getByClass', {
        queryOne: (element, selector) => element.querySelector(`.${selector}`),
        queryAll: (element, selector) =>
          element.querySelectorAll(`.${selector}`),
      });

      const element = await page.$('getByClass/foo');
      expect(element).toBeDefined();

      const elements = await page.$$('getByClass/foo');
      expect(elements.length).toBe(3);
    });
    it('should eval when both queryOne and queryAll are registered', async () => {
      const { page, puppeteer } = getTestState();
      await page.setContent(
        '<div id="not-foo"></div><div class="foo">text</div><div class="foo baz">content</div>'
      );
      puppeteer.__experimental_registerCustomQueryHandler('getByClass', {
        queryOne: (element, selector) => element.querySelector(`.${selector}`),
        queryAll: (element, selector) =>
          element.querySelectorAll(`.${selector}`),
      });

      const txtContent = await page.$eval(
        'getByClass/foo',
        (div) => div.textContent
      );
      expect(txtContent).toBe('text');

      const txtContents = await page.$$eval('getByClass/foo', (divs) =>
        divs.map((d) => d.textContent).join('')
      );
      expect(txtContents).toBe('textcontent');
    });

    it('should allow piercing shadow dom', async () => {
      const { page, puppeteer } = getTestState();
      await page.setContent(
        `<div id="not-foo"></div><div class="foo">text</div><div class="foo baz">content</div>
        <script>
        let bar1 = null;
        let bar2 = null;
        window.addEventListener('DOMContentLoaded', () => {
          const shadowRoot = document.body.attachShadow({mode: 'open'});
          bar1 = document.createElement('bar');
          bar2 = document.createElement('bar');
          bar3 = document.createElement('bar');
          bar1.className = 'Text in';
          bar2.className = 'nested';
          bar3.className = 'Shadow DOM';
          bar1.appendChild(bar2);
          shadowRoot.appendChild(bar1);
          shadowRoot.appendChild(bar3);
        });
        </script>
        `
      );
      function querySelectorShadowOne(
        element: Element | Document | ShadowRoot,
        selector: string
      ): Element | null {
        let res;
        const search = (root: Element | Document | ShadowRoot) => {
          const iter = document.createNodeIterator(
            root,
            NodeFilter.SHOW_ELEMENT
          );
          let currentNode;
          while (!res && (currentNode = iter.nextNode())) {
            if (currentNode.shadowRoot) {
              search(currentNode.shadowRoot);
            }
            if (!res && currentNode.matches(selector)) {
              res = currentNode;
            }
          }
        };
        search(element);
        return res;
      }

      function querySelectorShadowAll(
        element: Element | Document,
        selector: string
      ): Element[] {
        const result = [];
        const collect = (root: Element | Document | ShadowRoot) => {
          const iter = document.createNodeIterator(
            root,
            NodeFilter.SHOW_ELEMENT
          );
          let currentNode;
          while ((currentNode = iter.nextNode())) {
            if (currentNode.shadowRoot) {
              collect(currentNode.shadowRoot);
            }
            if (currentNode.matches(selector)) {
              result.push(currentNode);
            }
          }
        };
        collect(element);
        return result;
      }
      puppeteer.__experimental_registerCustomQueryHandler('pierceShadow', {
        queryOne: querySelectorShadowOne,
        queryAll: querySelectorShadowAll,
      });

      const txtContent = await page.$eval(
        'pierceShadow/bar',
        (bar) => bar.className
      );
      expect(txtContent).toBe('Text in');

      const txtContents = await page.$$eval('pierceShadow/bar', (bars) =>
        bars.map((d) => d.className).join(' ')
      );
      expect(txtContents).toBe('Text in nested Shadow DOM');
    });
  });

  describe('Querying by accessible name and role', () => {
    before(() => {
      const { puppeteer } = getTestState();
      puppeteer.__experimental_registerCustomQueryHandler(
        'aria',
        puppeteer.__experimental_ariaQueryHandler
      );
    });
    after(() => {
      const { puppeteer } = getTestState();
      puppeteer.__experimental_clearQueryHandlers();
    });
    describe('can find button element', () => {
      beforeEach(async () => {
        const { page } = getTestState();
        await page.setContent(
          '<div id="div"><button id="btn" role="button">Submit</button></div>'
        );
      });

      it('should find button by role', async () => {
        const { page } = getTestState();
        const button = await page.$('aria/&button');
        const id = await button.evaluate((b: Element) => b.id);
        expect(id).toBe('btn');
      });

      it('should find button by name and role', async () => {
        const { page } = getTestState();
        const button = await page.$('aria/Submit&button');
        const id = await button.evaluate((b: Element) => b.id);
        expect(id).toBe('btn');
      });
    });

    describe('should find first matching element', () => {
      beforeEach(async () => {
        const { page } = getTestState();
        await page.setContent(`
                              <div role="menu" id="mnu1" aria-label="menu div"></div>
                              <div role="menu" id="mnu2" aria-label="menu div"></div>
                              `);
      });

      it('should find by name', async () => {
        const { page } = getTestState();
        const div = await page.$('aria/menu div');
        const id = await div.evaluate((b: Element) => b.id);
        expect(id).toBe('mnu1');
      });
    });

    describe('should find all matching elements', () => {
      beforeEach(async () => {
        const { page } = getTestState();
        await page.setContent(`
                              <div role="menu" id="mnu1" aria-label="menu div"></div>
                              <div role="menu" id="mnu2" aria-label="menu div"></div>
                              `);
      });

      it('should find menu by name', async () => {
        const { page } = getTestState();
        const divs = await page.$$('aria/menu div');
        const ids = await Promise.all(
          divs.map((n) => n.evaluate((b: Element) => b.id))
        );
        expect(ids.join(', ')).toBe('mnu1, mnu2');
      });
    });

    describe('should find name sourced from aria-label', () => {
      beforeEach(async () => {
        const { page } = getTestState();
        await page.setContent(`
                              <div role="menu" id="mnu1" aria-label="menu-label1">menu div</div>
                              <div role="menu" id="mnu2" aria-label="menu-label2">menu div</div>
                              `);
      });

      it('should find by name', async () => {
        const { page } = getTestState();
        const menu = await page.$('aria/menu-label1');
        const id = await menu.evaluate((b: Element) => b.id);
        expect(id).toBe('mnu1');
      });

      it('should find by name', async () => {
        const { page } = getTestState();
        const menu = await page.$('aria/menu-label2');
        const id = await menu.evaluate((b: Element) => b.id);
        expect(id).toBe('mnu2');
      });
    });

    describe('can create selector and find same element', async () => {
      async function getAriaSelector(element: ElementHandle): Promise<string> {
        const { name, role } = await element.evaluate((element) => {
          const e = element as any;
          return { name: e.computedName, role: e.computedRole };
        });
        return `aria/${name}&${role}`;
      }
      async function checkSelectorUnique(
        page: Page,
        selector: string
      ): Promise<boolean> {
        const all = await page.$$(selector);
        return all.length === 1;
      }
      beforeEach(async () => {
        const { page } = getTestState();
        await page.setContent(`
                              <div role="menu" id="mnu1" aria-label="menu-label1">menu div</div>
                              <div role="menu" id="mnu2" aria-label="menu-label2">menu div</div>
                              `);
      });
      it('can create name selector and find again', async () => {
        const { page } = getTestState();
        const mnu1A = await page.$('#mnu1');
        const ariaSelector = await getAriaSelector(mnu1A);
        expect(await checkSelectorUnique(page, ariaSelector)).toBeTruthy();
        const mnu1B = await page.$(ariaSelector);
        expect(mnu1B.jsonValue).toBe(mnu1A.jsonValue);
      });
    });
  });
});
