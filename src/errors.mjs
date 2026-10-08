export class GatewayError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = 'GatewayError';
    this.code = code;
    this.status = status;
  }
}

// Never interpolate an upstream error body: it can echo prompts or credentials.
export function statusHint(status) {
  if (status >= 300 && status < 400) return '리디렉션을 거절했습니다. 계정 화면의 Base URL과 경로/슬래시를 확인하세요.';
  return ({
    400: '요청 형식, 지원하지 않는 기능/beta 또는 조직 개인정보 필터 거절일 수 있습니다. 기능 문서와 조직 정책을 확인하세요. 필터를 자동으로 끄지 않습니다.',
    401: '인증 실패: 키의 유효성·해지 여부와 키를 발급한 기관의 Base URL을 확인하세요.',
    402: '크레딧 부족: ChatKHU 계정의 잔액을 확인하세요.',
    403: '권한 거절: 조직 API 활성화, 모델 접근 권한, 기관 일치 여부 및 조직 필터를 확인하세요.',
    404: '모델 ID 또는 API 경로 오류: models와 Base URL을 확인하세요. /claude/v1은 /v1이 중복됩니다.',
    413: '요청 크기 제한을 초과했습니다. 프로젝트 컨텍스트와 첨부 크기를 확인하세요.',
    422: '요청의 기능·옵션을 upstream이 수용하지 않았습니다. 모델별 지원 범위를 확인하세요.',
    429: '속도 또는 크레딧 예약 한도입니다. Retry-After를 확인하고 동시 요청 수를 줄이세요.',
  })[status] ?? (status >= 500 ? 'ChatKHU 또는 모델 제공사 장애입니다. 자동 재시도하지 않았습니다.' : '예상하지 못한 HTTP 상태입니다. 안전한 요청 ID와 상태를 확인하세요.');
}

export function safeError(error) {
  if (error instanceof GatewayError) return error.message;
  return ({
    EADDRINUSE: '포트가 사용 중입니다. --port 0으로 실행하거나 다른 포트를 선택하세요. 기존 프로세스를 종료하지 않았습니다.',
    ENOENT: '필요한 파일 또는 실행 파일이 없습니다. 경로와 설치 상태를 확인하세요.',
    EACCES: '파일 또는 포트 접근 권한이 없습니다. 사용자 전용 경로와 권한을 확인하세요.',
    EPERM: '운영체제가 접근을 거절했습니다. 파일 권한과 실행 정책을 확인하세요.',
    ENOTFOUND: 'upstream 주소를 찾을 수 없습니다. Base URL과 DNS/네트워크를 확인하세요.',
    ECONNREFUSED: '연결이 거절되었습니다. 서버 주소와 리스너 상태를 확인하세요.',
    ECONNRESET: '연결이 중간에 종료되었습니다. 자동 재전송하지 않았습니다.',
    ETIMEDOUT: '연결 또는 유휴 타임아웃입니다. 네트워크와 제한 시간을 확인하세요.',
    ABORT_ERR: '요청이 취소되었습니다.',
  })[error?.code] ?? '작업에 실패했습니다. doctor로 설정을 확인하세요. 비밀정보 보호를 위해 원문 오류는 출력하지 않습니다.';
}
