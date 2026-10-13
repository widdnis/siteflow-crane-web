# SiteFlow Web
SiteFlow: JSON 파일·URL 입력, 3D 현장 Viewer, 2D 배치도 및 현장 보고서.

- 실행: npm run dev → http://127.0.0.1:5173/siteflow-crane-web/
- 빌드: npm run build (기존 의존성 사용, 패키지 추가 없음)
- 검증: npm test
- 첫 화면에서 로컬 .json(20 MB 이하) 또는 CORS 허용 HTTP(S) 직접 JSON URL 입력.
- 기존 public/data/viewer_data.json은 TC1 축약본으로 유지; 이제 자동 로딩하지 않음.
- 성공하면 동일 불변 스냅샷의 요약과 Viewer/Report 화면 전환 표시.
- Viewer는 site·건물·실제 자재와 최종 cranes[] 3대를 표시. 기존 createCrane/setCraneRotation을 보존하고 3축 제어를 추가. 카메라 4시점·선택·높이 시각화·작업 반경·전체화면 제공.
- 홈 복귀/탭 전환 시 Viewer 자원을 해제하고 차량·자동회전을 일시정지. 같은 스냅샷 재진입은 위치·제어·카메라 상태를 복원하고, 새 JSON 로딩 성공 시 초기화. 실패/취소 시 이전 유효 스냅샷 유지.
- Report는 5개 섹션·동일 스냅샷 2D PNG·브라우저 인쇄/PDF 저장 제공. 공유는 미구현.
- tests/fixtures는 실제 최신 JSON의 복사본이며 내부 경로를 포함할 수 있음. Vite public 폴더 밖에 두고 배포 산출물에 포함하지 않음.
- JSON 계약: docs/UNIFIED_JSON_SCHEMA.md, 최종 GH 미연결 항목: docs/FINAL_GH_MAPPING_TODO.md.
- 최신 JSON에는 활성 자재 8이라는 숫자가 없음; EXPORT_CHECK의 6/8 기록과 JSON의 원본 경고를 별도로 검증. UI에서는 활성 수 missing.

## GitHub Pages
기존 origin: https://github.com/widdnis/siteflow-crane-web
Vite base: /siteflow-crane-web/ (개발 서버에도 적용)
.github/workflows/deploy.yml은 main push/manual dispatch, Node 24, npm ci/build, dist 배포.
기존 workflow로 main push 시 배포합니다. Vite base 및 workflow는 유지합니다.

## 검증 한계
좌표는 이미 meters / Unity Y-up 변환됨. 추가 변환 없음.
폴리곤은 닫힘/점/면적까지 검사; 자기 교차·위상과 확장 객체 상세 검증은 후속 단계.
Report/URL 실패/TC1 조작의 실제 브라우저 확인은 연결된 브라우저가 없어 미검증.

Viewer 상세/한계: docs/VIEWER_STEP2.md. 실제 브라우저 렌더링·클릭·전체화면은 미검증.

STEP 3: 실제 경로 미제공 시 missing 유지, 차량 패널 DEMO 체크로 별도 예시 트랙 시작. 시작/정지/초기화/전진/후진/속도 제어. 계약·수동 검증: docs/VEHICLE_STEP3.md.

STEP 4: 2D 배치도 탭은 동일 불변 JSON의 독립 X/Z Canvas. PNG 2400×1800 출력, DEMO/3D 조작 상태 제외. 함수 재사용: src/layout.js. 스타일 원천·한계·수동 확인: docs/LAYOUT_STEP4.md. 실제 브라우저 Canvas·PNG 다운로드는 미검증.

STEP 5: Report 5섹션·원본 GH 오류/누락·별도 EXPORT_CHECK 참고 출처·A4 인쇄/PDF 대화상자. 실제 PDF 저장은 미검증. 수동 절차: docs/REPORT_STEP5.md.

STEP 6A 통합 QA: npm test / npm run build. 실제 브라우저 수동 확인과 증거 전달 양식: docs/FINAL_BROWSER_QA.md. API 모의 수명 테스트는 실제 화면/PDF 검증이 아님. 배포·commit·push 미수행.


## 릴리스 QA 및 비공개 테스트 입력
사용자 확인: 로컬 브라우저 1차 8/8, 2차 정상 5개 및 상태 보존 추가 확인, 최종 보완 4/4 정상. CLI의 모의 테스트와 사용자 실제 브라우저 결과를 구분합니다. 공개 배포 후 동일 흐름 재확인은 docs/FINAL_BROWSER_QA.md를 참고하세요.
56개 테스트는 비공개 로컬 QA 자료를 사용합니다. 별도 checkout에서는 원본 소유자가 제공한 tests/fixtures/viewer_data_20261012_142857_140.json, 상위 루트의 viewer_data.json 및 EXPORT_CHECK_20261012_142857_140.md를 원래 위치에 제공해야 npm test 전체를 실행할 수 있습니다. 해당 자료는 저장소에 공개하지 않습니다. npm ci / npm run build 및 실제 앱은 이 자료를 필요로 하지 않습니다.
PNG: {JSON 파일명_확장자제외}_Layout_{YYYYMMDD_HHMMSS}.png. PDF 제안: {JSON 파일명_확장자제외}_Report_{YYYYMMDD_HHMMSS}.pdf. 버튼 클릭 시점의 로컬 시각이며 PDF 최종 저장 이름은 브라우저 설정에 따릅니다.
