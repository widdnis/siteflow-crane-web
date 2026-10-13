# 최종 GH 매핑 확인 목록 (STEP 1, 실제 연결 미수행)
JsonExporter v1.2는 InstanceGuid 고정이 아니라 입력/출력 포트 집합으로 crane/layout/shape/schedule 역할을 구분하고 VolatileData를 읽는다. 기존 Exporter 수정 없음.

- crane 역할 입력: site,bldg,bldgH,bldgName,gate,nogo,catalog,selModel,selRank,run; 출력: cranePts,craneBases,craneCircs,craneInfo,craneScore,assignedCraneTypes,info.
- layout 역할 입력: site,bldgCurves,bldgHeights,obstacles,gatePt,cranePos,currentDay,layoutGenes,dimRatioGenes,startDays,endDays,volumes,maxHeights,dailyFrequencies,matWeights,assignedCraneTypes; 출력: Fitness,MaterialBoxes,ClearanceAreas,Errors,SummaryReport.
- shape 역할: cranePts/craneTypes/catalog/bldg/bldgH/bake → shapes/labels/info; schedule 역할: src → matName/startDays/endDays/volumes/maxHeights/dailyFrequencies/matWeights.
- ReportExporter v2.4의 roadWidth/branchWidth/clearance, candInfo/candScore, loadDist/loadLimit, SummaryReport를 최종 GH에서 확인 후 report에 매핑. Fitness·Errors·후보 감사 정보는 기존 metadata 보존.
- roads: 최종 도로 원본 경계·폭·중심선 및 검증된 vehicle path 확보. 영역만 있을 경우 중심선 계산·분기 검증 필요. 현재 미제공.
- layout: v3.4.3은 SiteElements에서 TextDot/TextEntity를 제외하고 실제 Rhino 표시 도형 + GH MaterialBoxes의 실시간 Preview 색, TC/게이트 라벨·범례를 Top capture에 통합한다. 관련 실제 형상·색·라벨·범례를 JSON으로 확보할 때까지 missing. 내부 상태 문구 v3.4.2는 파일 버전보다 우선하지 않음.
- 활성 자재 수: currentDay와 startDays/endDays를 이용한 원천 계산 결과를 schedule.active_material_count로 추가할지 최종 GH 검증 후 결정. 현 JSON에는 8 숫자 없음; 체크 문서만 6/8, JSON에는 불일치 경고 있음.
- 건물 시간별 높이 규칙/FBX/parts/pivot null 유지; Rhino 회전각의 웹 방향 매핑은 실제 샘플로 별도 검증.
- 최종 GH 연결은 별도 단계. 후보 42건을 최종 3대에 합치거나 누락 자재 2개를 생성하지 않는다.

STEP 3: 실제 roads 원천 포트는 여전히 미확인. vehicle_paths/vehicle_enabled 중심선 계약 및 명시적 DEMO만 구현; 최종 GH/JSON 원본 미수정.

STEP 4: v3.4.3의 Rhino visible object/Layer/DrawColor, SiteElements·MaterialBoxes Custom Preview 실시간 색과 원형, TextDot 제외 및 범례 원천 확보 필요. 웹은 현재 JSON 도형을 독립 투영하며 해당 원형/스타일 수집 완료로 주장하지 않음.
