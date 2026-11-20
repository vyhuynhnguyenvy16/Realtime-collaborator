import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

// Needs DATABASE_URL, JWT_ACCESS_SECRET and JWT_REFRESH_SECRET.
describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET) reports the database and never returns users', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
    expect(response.body.users).toBeUndefined();
  });

  afterEach(async () => {
    await app.close();
  });
});
