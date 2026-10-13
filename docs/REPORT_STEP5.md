# STEP 5 ReportExporter v2.4 보고서·인쇄
원본 C# HTML의 inputs / crane-results / layout-results / drawing / appendix 5개 섹션 흐름을 사용한다.
CSS 토큰/시스템·Noto Sans KR 글꼴, .page/header/meta/result cards/kv-table/selected-box/status-box/경고/표 스타일을 웹에서 재사용한다.
원본은 top 3 후보 + 나머지 후보 details, loadDist/loadLimit, Fitness/Errors/SummaryReport, 배치도와 상세 원천을 표시한다.
원본 @media print는 .page 패딩 12mm, details break-inside avoid, drawing-section break-before page. 웹은 A4 @page 12mm와 긴 표 페이지 분할에 맞게 보완한다.

## 실제 데이터와 누락
- metadata.candidate_count=42 및 candidate_descriptions/scores 원문 vs cranes[] 최종 3대 별도 표시.
- position/working_radius_m/height_m/base_direction_degrees_rhino는 JSON 원값. 모델 선택 이유·스코어 의미·성능·안전 판정 생성 없음.
- materials[] 실제 6개·metadata.errors 4건 및 원본 불일치 warning 유지. Fitness 값은 원본 수치이며 해석·재계산 없음.
- schedule.active_material_count는 현재 JSON에 없으므로 missing. EXPORT_CHECK_20261012_142857_140.md의 6/8은 별도 개발 검증 출처로 표시, 현재 입력 필드/검증 결과로 사용하지 않는다.
- report.inputs.roadWidth/branchWidth/clearance 선택; 실제 roads.widths_m.main/branch가 제공되면 원천을 명시한 fallback. 현재 missing.
- report.candidates.loadDist/loadLimit, report.layout_results.summary는 현재 missing. GH candInfo/candScore와 JSON 후보 메타데이터의 최종 포트 연결은 미검증.
- catalog_spec/crane_catalog는 원본 CSV 참조값일 뿐 실제 장비 운용 검증 아님. rent의 화폐·기간 단위 추정 없음.
- 실제 GH 포트 및 SiteElements 원형/실시간 Preview 색·레이어는 미제공. 원본 파일/Exporter/GH 수정 없음.

## 표시·상태·보안
미제공 undefined=missing, 명시 null=미확인, 빈 목록=해당 없음, 미검증=검증 미수행 별도 배지.
값 제공/오류 0건을 안전성·최적성·실제 시공 결과로 해석하지 않는다.
입력 파일명/후보 문구/객체명/원본 오류/카탈로그 등은 HTML 특수문자 escaping. URL query/hash/credential와 GH/Rhino 절대경로는 보고서에서 표시하지 않는다.
모든 섹션은 같은 불변 snapshot에서 생성, UI 회전/높이/차량 상태는 사용하지 않는다. 새 입력/탭 이동/홈 복귀 시 보고서 DOM·이미지 Blob URL·인쇄 이벤트 해제.

## 배치도·인쇄
STEP 4 createLayoutPng를 재사용, 별도 canvas의 2400×1800 PNG 삽입. DEMO 차량·경로 제외.
폰트·PNG 이미지 decode가 완료된 뒤 인쇄 버튼 활성. 배치도 생성 실패 시 원인 경고를 보고서에 남기고 나머지 내용을 인쇄 가능.
인쇄 / PDF 저장은 window.print() 대화상자이며 자동 PDF 파일 다운로드가 아니다. 외부 서비스·라이브러리 없음.
A4 portrait/12mm, 메뉴·입력·요약/Viewer 조작/UI 버튼 숨김, 보고서 본문/표/경고/이미지만 출력.
thead 반복, 긴 셀 줄바꿈, section 분할 허용·heading/row/그림 잘림 방지, drawing-section 새 페이지. 이미지 원 비율 4:3 유지.
인쇄 전에 후보·상세 details를 열고 종료 후 원상태 복구. Ctrl+P는 배치도 준비를 기다리지 못하므로 버튼 사용 권장.
보고서 전체 화면 API 실패 메시지, 인쇄 시 전체화면 해제. 실제 인쇄 페이지 수·브라우저 머리글/바닥글·축척은 브라우저 설정에 좌우되며 미검증.

## 수동 확인
1. npm run dev → 최신 JSON 로딩 → Report. 5개 섹션·후보42/선정3/실제자재6/오류4, active missing·별도 EXPORT_CHECK 6/8 참고 기록 확인.
2. TC 위치·반경·높이 및 실제 원문 값 확인. 없는 도로/하중/SummaryReport·안전 판단이 생성되지 않았는지 확인.
3. 2D 배치도가 표시될 때까지 대기 → 인쇄 / PDF 저장 → A4 미리보기. 메뉴/조작 없음, 후보 details 포함, 표 머리글/줄바꿈/배치도 비율/경고·페이지 잘림 확인.
4. 브라우저 인쇄 대상 PDF 저장 → 저장 파일 직접 열어 한국어 글꼴·페이지·그림·경고 검증. 이 단계는 자동 테스트만으로 성공 주장하지 않는다.
5. 새 JSON/빈 배열/null/missing/HTML 특수문자 입력 → 이전 데이터 없음·문자열 안전 표시. 3D·DEMO·2D PNG 회귀 확인.
브라우저가 연결되지 않아 실제 미리보기·PDF 저장은 미검증. npm test는 모델/5섹션/상태/escaping/PNG 호출/print details·CSS 구조를 검증한다.
