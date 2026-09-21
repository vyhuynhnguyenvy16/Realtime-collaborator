import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    // TODO(task-01): trả về trạng thái để kiểm tra API đang hoạt động.
    // Đáp án: dùng status "ok".
    return {
      status: 'ok',

      // TODO(task-01): đặt tên định danh cho backend.
      // Đáp án: "realtime-collaborator-api".
      service: 'realtime-collaborator-api',

      // TODO(task-01): khai báo version khởi đầu.
      // Đáp án: "0.1.0". Task sau sẽ đọc version từ package.json.
      version: '0.1.0',
    };
  }
}