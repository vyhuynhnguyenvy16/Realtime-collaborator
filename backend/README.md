# Realtime Collaborator Backend

Backend NestJS cho ứng dụng cộng tác tài liệu thời gian thực. Hệ thống sử dụng:

- NestJS + TypeScript
- PostgreSQL + Prisma
- Redis Pub/Sub với `ioredis` để đồng bộ nhiều instance
- Yjs cho CRDT và trạng thái awareness
- Vitest cho unit/integration test
- Testcontainers cho integration test với PostgreSQL và Redis thật

## API

All routes except `/health`, `/auth/register`, `/auth/login` and `/auth/refresh` need
`Authorization: Bearer <accessToken>`.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/health` | `{ status, database }`, no user data |
| POST | `/auth/register` | `{ email, password, name? }` → tokens |
| POST | `/auth/login` | → `{ accessToken, refreshToken }` |
| POST | `/auth/refresh` | `{ refreshToken }` → `{ accessToken }` |
| POST | `/auth/logout` | revokes every refresh token of the user |
| GET / PATCH | `/auth/me` | profile `{ id, email, name }`; PATCH `{ name }` |
| GET | `/documents` | my documents with `role` and `owner` |
| POST | `/documents` | `{ title }` |
| GET | `/documents/:id` | document, my `role`, members with email/name; 404 vs 403 |
| PATCH | `/documents/:id` | `{ title }` (owner, editor) |
| DELETE | `/documents/:id` | owner only |
| POST | `/documents/:id/share` | `{ email \| userId, role: EDITOR \| VIEWER }` (owner) |
| DELETE | `/documents/:id/access/:userId` | owner removes someone, or a member leaves |
| GET | `/documents/:id/versions` | saved and automatic versions |
| POST | `/documents/:id/versions` | `{ label? }` save the current content |
| GET | `/documents/:id/versions/:versionId` | Yjs `state` for a preview |
| POST | `/documents/:id/versions/:versionId/restore` | restores it for everyone |

WebSocket: `ws(s)://<host>/realtime?token=<accessToken>`, frames `{ event, data }`.
Client sends `join {documentId, yjsClientId}`, `update {documentId, update, id?}`,
`awareness {documentId, update}`. Server sends `sync {state, role}`, `update`,
`awareness`, `ack {id}`, `role {role}`, `meta {title}`, `error {message}`.
Viewers cannot send updates. Close code 1008 means `Unauthorized` or `Forbidden`.

Deploying: see [DEPLOY.md](DEPLOY.md).

## 1. Yêu cầu môi trường

Cài các phần mềm sau trước khi chạy project:

- Node.js 20 trở lên, kèm npm
- Docker Desktop đang chạy
- Git

Kiểm tra cài đặt:

```bash
node --version
npm --version
docker --version
docker info
```

`docker info` phải trả về thông tin Docker Server. Nếu lệnh này không chạy, các test Testcontainers sẽ không thể khởi tạo PostgreSQL và Redis.

## 2. Lấy mã nguồn và cài thư viện

Từ thư mục repository:

```bash
cd Realtime-collaborator/backend
npm install
```

Các thư viện runtime và test được khai báo trong `package.json`. Không cần cài global NestJS, Prisma hoặc Vitest.

## 3. Cấu hình biến môi trường

Tạo file `backend/.env`:

```env
DATABASE_URL="postgresql://collab_user:collab_password@localhost:5433/collab_db?schema=public"
JWT_ACCESS_SECRET="replace-with-a-long-random-access-secret"
JWT_REFRESH_SECRET="replace-with-a-long-random-refresh-secret"
REDIS_URL="redis://localhost:6379"
```

Không commit file `.env` hoặc các secret thật vào Git.

## 4. Khởi động PostgreSQL và Redis

### Cách A: PostgreSQL bằng Docker Compose

File `docker-compose.yml` ở thư mục repository hiện chỉ khởi động PostgreSQL. Chạy từ thư mục repository:

```bash
cd Realtime-collaborator
docker compose up -d postgres
docker compose ps
```

PostgreSQL được map ra `localhost:5433`, phù hợp với `DATABASE_URL` ở trên.

Khởi động Redis riêng:

```bash
docker run -d --name collab-redis -p 6379:6379 redis:7-alpine
```

Nếu container đã tồn tại:

```bash
docker start collab-redis
```

Kiểm tra Redis:

```bash
docker exec collab-redis redis-cli ping
```

Kết quả đúng là `PONG`.

### Dừng dịch vụ local

```bash
docker stop collab-redis
cd Realtime-collaborator
docker compose down
```

Muốn xóa cả dữ liệu PostgreSQL local, dùng `docker compose down -v`. Lệnh này xóa volume database.

## 5. Đồng bộ Prisma với database

Sau khi PostgreSQL sẵn sàng, từ thư mục `backend` chạy:

```bash
npx prisma generate
npx prisma db push
```

`prisma generate` tạo Prisma Client từ schema. `prisma db push` tạo hoặc cập nhật các bảng hiện có, bao gồm:

- `users`
- `documents`
- `document_access`
- `document_events`
- `document_snapshots`

Xem database bằng Prisma Studio:

```bash
npx prisma studio
```

## 6. Chạy backend

Từ thư mục `backend`:

```bash
npm run start:dev
```

Server mặc định chạy tại:

```text
http://localhost:3000
```

Các lệnh khác:

```bash
npm run start       # chạy development một lần
npm run build       # compile TypeScript
npm run start:prod  # chạy bản đã build trong dist/
npm run lint        # kiểm tra lint
npm run format      # format src và test
```

WebSocket realtime dùng path:

```text
ws://localhost:3000/realtime?token=<JWT_ACCESS_TOKEN>
```

## 7. Chạy test

### Test nhanh không cần Docker

Chạy test CRDT deterministic:

```bash
npx vitest run test/yjs-sync.integration-spec.ts
```

Test này kiểm tra:

- hai Y.Doc độc lập hội tụ sau khi trao đổi update
- update đến sai thứ tự vẫn tái tạo đúng state

### Toàn bộ test integration với container thật

Docker Desktop phải đang chạy. Testcontainers tự tạo PostgreSQL và Redis riêng, không dùng database trong `docker-compose.yml` và không dùng Redis local.

```bash
npx vitest run test/persistence.integration-spec.ts test/redis-sync.integration-spec.ts test/access-control.integration-spec.ts
```

Các test này kiểm tra:

- persist event và replay từ snapshot/event log
- Redis sync giữa hai instance giả lập
- không bị publish loop
- access control cho outsider và `VIEWER`

### Chạy toàn bộ test

```bash
npm test
```

Hoặc chạy cả test integration mới bằng một lệnh rõ ràng:

```bash
npx vitest run "test/**/*.spec.ts" "test/**/*.integration-spec.ts"
```

### Coverage

```bash
npm run test:cov
```

## 8. Tiêu chí backend chạy thành công

Thực hiện lần lượt:

```bash
npm run build
npm run lint
npx vitest run test/yjs-sync.integration-spec.ts
npx vitest run test/persistence.integration-spec.ts test/redis-sync.integration-spec.ts test/access-control.integration-spec.ts
```

Kết quả mong đợi:

- `npm run build` kết thúc với exit code 0
- `npm run lint` không có error
- Vitest báo tất cả test passed
- log NestJS không có lỗi kết nối PostgreSQL hoặc Redis

## 9. Kiểm tra Redis nhiều instance thủ công

Để chạy hai backend cùng lúc, dùng hai port khác nhau. Trong PowerShell:

```powershell
$env:PORT=3000; npm run start:dev
```

Mở terminal thứ hai:

```powershell
$env:PORT=3001; npm run start:dev
```

Lưu ý: code hiện tại cần đọc biến `PORT` trong `main.ts` nếu muốn đổi port bằng cách này. Nếu `main.ts` vẫn cố định `app.listen(3000)`, hãy chạy hai process với cấu hình port riêng trước khi test thủ công.

Hai instance phải dùng chung:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`

Khi một client gửi update vào instance A, client đang ở instance B phải nhận được update qua Redis.

## 10. Xử lý lỗi thường gặp

### `docker is not recognized`

Cài Docker Desktop, mở Docker Desktop và khởi động lại terminal. Kiểm tra bằng:

```bash
docker info
```

### `ECONNREFUSED` tới PostgreSQL

Kiểm tra container và port:

```bash
docker compose ps
docker logs collab-postgres
```

Đảm bảo `DATABASE_URL` dùng port `5433`, không phải `5432`, khi dùng compose hiện tại.

### `ECONNREFUSED` tới Redis

```bash
docker ps
docker exec collab-redis redis-cli ping
```

Nếu chưa có container:

```bash
docker run -d --name collab-redis -p 6379:6379 redis:7-alpine
```

### Prisma báo thiếu model `documentEvent` hoặc `documentSnapshot`

Chạy lại:

```bash
npx prisma generate
npx prisma db push
```

Sau đó trong VS Code chạy `TypeScript: Restart TS Server` nếu diagnostics cũ vẫn còn.

### Testcontainers timeout hoặc không pull được image

Đảm bảo Docker đang chạy và máy có thể pull các image:

- `postgres:16-alpine`
- `redis:7-alpine`

Có thể kiểm tra trước:

```bash
docker pull postgres:16-alpine
docker pull redis:7-alpine
```

### Vitest báo `No test files found`

Đảm bảo chạy từ thư mục `backend` và `vitest.config.ts` có include:

```ts
include: ['**/*.spec.ts', '**/*.integration-spec.ts']
```

## 11. Cấu trúc realtime và persistence

- `src/realtime/realtime.gateway.ts`: WebSocket authentication, room, broadcast và Redis bridge
- `src/realtime/yjs-document-manager.service.ts`: Y.Doc memory, event persistence, snapshot và replay
- `src/realtime/redis-sync.service.ts`: Redis pub/sub hai connection riêng cho publish/subscribe
- `test/yjs-sync.integration-spec.ts`: CRDT convergence và reorder
- `test/persistence.integration-spec.ts`: event log/snapshot replay
- `test/redis-sync.integration-spec.ts`: cross-instance Redis sync
- `test/access-control.integration-spec.ts`: document permission

Khi phát triển tính năng mới, nên chạy test liên quan trước, sau đó chạy `npm run build` và toàn bộ integration test trước khi kết luận backend đã ổn định.
