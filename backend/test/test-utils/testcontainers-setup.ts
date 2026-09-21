import { execFileSync } from 'node:child_process';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

const POSTGRES_USER = 'test_user';
const POSTGRES_PASSWORD = 'test_password';
const POSTGRES_DB = 'realtime_test';

export type TestContainerEnvironment = {
  databaseUrl: string;
  redisUrl: string;
  teardown: () => Promise<void>;
};

export async function setupTestContainers(): Promise<TestContainerEnvironment> {
  const postgresContainer = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({
      POSTGRES_USER,
      POSTGRES_PASSWORD,
      POSTGRES_DB,
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
    .start();

  const redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .start();

  const databaseUrl = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${postgresContainer.getHost()}:${postgresContainer.getMappedPort(5432)}/${POSTGRES_DB}`;
  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

  try {
    const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    execFileSync(npxCommand, ['prisma', 'db', 'push', '--skip-generate'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });
  } catch (error) {
    await redisContainer.stop();
    await postgresContainer.stop();
    throw error;
  }

  return {
    databaseUrl,
    redisUrl,
    teardown: async () => {
      await redisContainer.stop();
      await postgresContainer.stop();
    },
  };
}

export type StartedContainers = {
  postgres: StartedTestContainer;
  redis: StartedTestContainer;
};
