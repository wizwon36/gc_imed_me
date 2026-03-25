function buildApiUrl(action, params = {}) {
  const url = new URL(CONFIG.API_BASE_URL);
  url.searchParams.set('action', action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
}

async function parseApiResponse(response) {
  let data;

  try {
    data = await response.json();
  } catch (error) {
    throw new Error('서버 응답을 해석하지 못했습니다.');
  }

  if (!response.ok) {
    throw new Error(data?.message || '서버 요청에 실패했습니다.');
  }

  if (!data.success) {
    throw new Error(data.message || '요청 처리 중 오류가 발생했습니다.');
  }

  return data;
}

async function apiGet(action, params = {}) {
  const url = buildApiUrl(action, params);

  const response = await fetch(url, {
    method: 'GET'
  });

  return await parseApiResponse(response);
}

async function apiPost(action, payload = {}) {
  const url = buildApiUrl(action);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  return await parseApiResponse(response);
}
