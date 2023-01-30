import { Injectable } from '@nestjs/common';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import * as fs from 'fs';
import { AbstractHttpAdapter } from '@nestjs/core';
import { ServeStaticModuleOptions } from '../interfaces/serve-static-options.interface';
import {
  DEFAULT_RENDER_PATH,
  DEFAULT_ROOT_PATH
} from '../serve-static.constants';
import { isRouteExcluded } from '../utils/is-route-excluded.util';
import { validatePath } from '../utils/validate-path.util';
import { AbstractLoader } from './abstract.loader';
import { createDecipheriv } from 'crypto';
import parseurl = require('parseurl');
import path = require('path');
import { DEFAULT_SECRET } from '..';

@Injectable()
export class ExpressLoader extends AbstractLoader {
  public register(
    httpAdapter: AbstractHttpAdapter,
    optionsArr: ServeStaticModuleOptions[]
  ) {
    const app = httpAdapter.getInstance();
    const express = loadPackage('express', 'ServeStaticModule', () =>
      require('express')
    );
    optionsArr.forEach((options) => {
      options.renderPath = options.renderPath || DEFAULT_RENDER_PATH;
      const clientPath = options.rootPath || DEFAULT_ROOT_PATH;
      const indexFilePath = this.getIndexFilePath(clientPath);
      const { key, iv } = options.secret || DEFAULT_SECRET;

      const renderFn = (req: any, res: any, next: Function) => {
        if (!isRouteExcluded(req, options.exclude)) {
          if (
            options.serveStaticOptions &&
            options.serveStaticOptions.setHeaders
          ) {
            const stat = fs.statSync(indexFilePath);
            options.serveStaticOptions.setHeaders(res, indexFilePath, stat);
          }

          try {
            const url = parseurl(req);
            const filePath = path.join(clientPath, url.path);

            const stat = fs.statSync(filePath);
            const stream = fs.createReadStream(filePath);

            const decipher = createDecipheriv('aes-256-cbc', key, iv);

            res.set(
              'Cache-Control',
              'private, no-transform, immutable, max-age=604800'
            );
            stream.pipe(decipher).pipe(res);
          } catch (e) {
            console.log('Failed to get file.', e);
            res.status(500).send('Failed to get file.');
          }
        } else {
          next();
        }
      };

      if (options.serveRoot) {
        app.use(
          options.serveRoot,
          express.static(clientPath, options.serveStaticOptions)
        );
        const renderPath =
          typeof options.serveRoot === 'string'
            ? options.serveRoot + validatePath(options.renderPath as string)
            : options.serveRoot;

        app.get(renderPath, renderFn);
      } else {
        app.get(options.renderPath, renderFn);
        app.use(express.static(clientPath, options.serveStaticOptions));
      }
    });
  }
}
