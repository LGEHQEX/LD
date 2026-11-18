/**
 * ▶ 여기만 수정하면 됩니다.
 *  - GAS_URL: Apps Script 웹 앱 배포 URL (…/exec)
 *  - questions 의 label 이 구글시트 헤더(열 이름)가 됩니다. 운영 중 label 을 바꾸면 새 열이 생겨요.
 *  - type: likert(1~5) | nps(0~10) | single(단일선택) | multi(복수선택) | text | textarea
 *  - 선택지(options)에는 쉼표(,)를 넣지 마세요 (복수선택 구분자로 사용).
 *  - type: 'section' 은 설문 안의 구분 제목입니다.
 *  - course: true 문항은 대시보드 '과정 만족도' 탭에 따로 모아 보여줍니다.
 */
// 모듈 설문 문항 생성기 (주관식 필수로 바꾸려면 MEMO_REQUIRED = true)
const MEMO_REQUIRED = false;
function MOD(id, name, who) {
  const t = `${name}(${who})`;
  return [
    { id, type: 'likert', module: { name, who }, label: `${t} 모듈에 만족하였다.`, required: true },
    { id: id + '_memo', type: 'textarea', label: `${t} 모듈에서 가장 기억에 남는 내용은 무엇입니까?`, required: MEMO_REQUIRED },
  ];
}

window.SURVEY_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbw4yBPRFfuNWkkgZQIw39w6fRaPBjeEDjj2SgGgKQj0kYaFIx2z7rbE06gUZ7ulQio/exec',
  COURSE_NAME: '신임 임원급 직책 보임자 과정',
  REFRESH_SEC: 30, // 대시보드 자동 새로고침 주기(초)
  SHEET_URL: 'https://docs.google.com/spreadsheets/d/1nufFI1ioJVJ-nDJzEZnhLVNkThiP0rUOi9Wh9DTU7BY/edit?usp=sharing', // (선택) 구글시트 주소를 넣으면 대시보드에 '구글시트 열기' 버튼이 생김

  // 5점 척도 라벨 세트 (문항에서 scale: '이름' 으로 지정, 미지정 시 agree)
  SCALES: {
    agree: ['매우 아니다', '아니다', '보통', '그렇다', '매우 그렇다'],
    confidence: ['전혀 확신 없음', '확신 없음', '보통', '확신 있음', '매우 확신'],
  },

  surveys: {
    pre: {
      sheet: '사전설문', // 엑셀 다운로드 시 탭 이름 (GAS 의 시트 이름과 동일하게)
      title: '사전 설문',
      desc: '각 문항에 대해 현재 나의 확신 정도를 선택해 주세요. (약 3분)',
      // area: 요구 영역(참가자에게 표시) / lgway: 연계 LG Way 항목(대시보드에만 표시)
      questions: [
        { id: 'name', type: 'text', label: '이름', required: true, identity: true },
        { id: 'empno', type: 'text', label: '사번', required: true, identity: true },
        { id: 'q1', type: 'likert', scale: 'agree', area: '역할 전환', lgway: '저부가가치 업무 효율화, 자율적 업무 수행',
          label: '직접 챙길 일과 구성원에게 맡길 일을 구분하는 나만의 기준이 있다', required: true },
        { id: 'q2', type: 'likert', scale: 'agree', area: '역할 전환', lgway: '목표 달성 역할 분담',
          label: '산하 리더들의 역할을 중복과 공백 없이 나누는 방법을 알고 있다', required: true },
        { id: 'q3', type: 'likert', scale: 'agree', area: '시야 확장', lgway: '외부지향',
          label: '외부 시장 변화를 파악할 나만의 정보원과 방법이 있다', required: true },
        { id: 'q4', type: 'likert', scale: 'agree', area: '시야 확장', lgway: '리스크 관리',
          label: '우리 조직의 주요 리스크를 파악하고 설명할 수 있다', required: true },
        { id: 'q5', type: 'likert', scale: 'agree', area: '방향 정렬', lgway: '전략 연계 과제 설정',
          label: '상사가 내게 기대하는 최우선 과제를 한 문장으로 말할 수 있다', required: true },
        { id: 'q6', type: 'likert', scale: 'agree', area: '판단 기준', lgway: '의사결정 과정',
          label: '중요한 결정의 배경을 구성원에게 납득되도록 설명하는 방법을 알고 있다', required: true },
        { id: 'q7', type: 'likert', scale: 'agree', area: '성과 실행', lgway: '부서간 협업',
          label: '협업이 필요한 유관 부서와 관계를 만들 방법을 구상하고 있다', required: true },
        { id: 'q8', type: 'likert', scale: 'agree', area: '성과 실행', lgway: '의사결정 속도, 집요한 실행',
          label: '90일 안에 구성원의 신뢰를 얻을 첫 성과 과제를 정할 수 있다', required: true },
        { id: 'q9', type: 'likert', scale: 'agree', area: '성과 실행', lgway: '혁신 활동, 도전 장려',
          label: '구성원이 새로운 시도를 하도록 이끄는 방법을 알고 있다', required: true },
        { id: 'q10', type: 'likert', scale: 'agree', area: '성과 실행', lgway: 'Speak up',
          label: '다른 의견을 편하게 말할 수 있는 조직을 만드는 방법을 알고 있다', required: true },
        { id: 'priority', type: 'multi', min: 3, max: 3, area: '우선순위 선택', required: true,
          split: '우선순위 선택', // 시트에 '우선순위 선택 1/2/3' 열로 나눠 기록
          label: '이번 과정에서 가장 먼저 채우고 싶은 영역 3개를 골라 주세요',
          options: [
            'Q1 업무 위임 기준', 'Q2 산하 리더 역할 분담', 'Q3 외부 시장 변화 파악', 'Q4 조직 리스크 파악',
            'Q5 상사 기대 과제 정렬', 'Q6 결정 배경 설명', 'Q7 유관 부서 협업', 'Q8 90일 첫 성과 과제',
            'Q9 구성원 도전 이끌기', 'Q10 Speak up 조직 만들기',
          ] },
      ],
    },

    // 모듈 문항은 MOD(id, 모듈명, 강사명)으로 생성 → 만족도(5점) + 기억에 남는 내용(주관식)
    day1: {
      sheet: '만족도_1일',
      title: '1일차 설문 (11/30)',
      desc: '오늘 들으신 각 모듈에 대한 의견을 들려주세요.',
      questions: [
        { type: 'section', label: '모듈 설문' },
        ...MOD('d1m1', '임원급 리더의 자기성찰과 변화된 역할 인식', '서울대 최인철 교수'),
        ...MOD('d1m2', '회사의 전략 방향과 담당 조직의 과제 정렬', '경영전략담당'),
        ...MOD('d1m3', '외부 환경 변화를 읽고 대응하는 법', 'MI Task'),
        ...MOD('d1m4', '숫자로 사업의 효율과 리스크를 읽는 경영관리', '경영관리담당'),
        ...MOD('d1m5', '회사가 신임담당에게 기대하는 역할과 모습', 'CHO부문장'),
      ],
    },

    day2: {
      sheet: '만족도_2일',
      title: '2일차 설문 (12/1)',
      desc: '각 모듈과 과정 전체에 대한 의견을 들려주세요.',
      questions: [
        { type: 'section', label: '모듈 설문' },
        ...MOD('d2m1', '책임감 있는 임원의 행동규범과 정도경영', '윤리사무국'),
        ...MOD('d2m2', '강화되는 준법 경영과 Compliance Risk 관리', '준법사무국'),
        ...MOD('d2m3', '딜레마를 넘어 결정하는 임원의 의사결정 기준', 'aSSIST 신제구 교수'),
        ...MOD('d2m4', '조직의 변화 방향과 임원 성과 관리', '인사담당'),
        ...MOD('d2m5', '실행력을 높이는 신임담당의 소통 변화 전략', 'EX담당'),

        { type: 'section', label: '과정 만족도 설문' },
        { id: 'c_overall', type: 'likert', course: true, label: '전체적으로 교육과정에 만족하였다.', required: true },
        { id: 'c_relevance', type: 'likert', course: true, label: '학습 내용은 업무(혹은 역할) 관련성이 높았다.', required: true },
        { id: 'c_method', type: 'likert', course: true, label: '학습 방법은 학습 내용 전달에 적절하였다.', required: true },
        { id: 'c_apply', type: 'likert', course: true, label: '학습한 내용을 실무에 활용할 것이다.', required: true },
        { id: 'c_good', type: 'textarea', course: true, label: '신임 임원급 직책 보임자 과정에서 가장 긍정적인 경험은 무엇입니까?', required: false },
        { id: 'c_bad', type: 'textarea', course: true, label: '신임 임원급 직책 보임자 과정에서 개선이 필요한 부정적인 경험은 무엇입니까?', required: false },
      ],
    },
  },
};
