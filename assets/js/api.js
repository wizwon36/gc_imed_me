async function apiGet(action, params = {}) {
  const url = new URL(CONFIG.API_BASE_URL);
  url.searchParams.set('action', action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString(), {
    method: 'GET'
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || '요청 처리 중 오류가 발생했습니다.');
  }

  return data;
}

async function apiPost(action, payload = {}) {
  const url = `${CONFIG.API_BASE_URL}?action=${encodeURIComponent(action)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || '요청 처리 중 오류가 발생했습니다.');
  }

  return data;
}
