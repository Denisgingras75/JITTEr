// Load auth state
chrome.runtime.sendMessage({ action: 'getUser' }, function(user) {
  if (user && user.loggedIn) {
    document.getElementById('auth-logged-in').style.display = 'block';
    document.getElementById('auth-logged-out').style.display = 'none';
    document.getElementById('user-display').textContent = user.email || 'Signed in';
    if (user.email) document.getElementById('user-email').textContent = user.user_id.slice(0, 8) + '...';
  } else {
    document.getElementById('auth-logged-out').style.display = 'block';
    document.getElementById('auth-logged-in').style.display = 'none';
  }
});

// Load passport stats
chrome.storage.local.get('passport', function(data) {
  if (data.passport) {
    var p = data.passport;
    document.getElementById('level').textContent = p.level || 'Novice';
    var k = p.totalKeystrokes || 0;
    document.getElementById('totalKeys').textContent = k >= 1000 ? (k/1000).toFixed(1) + 'K' : k;
    document.getElementById('sessions').textContent = p.sessionsCompleted || 0;
  }
});

document.getElementById('sign-in-btn').addEventListener('click', function() {
  chrome.runtime.sendMessage({ action: 'signIn' }, function(res) {
    if (res && res.ok) window.close();
    else if (res && res.error) {
      document.getElementById('sign-in-btn').textContent = 'Auth failed — try again';
    }
  });
});

document.getElementById('sign-out-btn').addEventListener('click', function() {
  chrome.runtime.sendMessage({ action: 'signOut' }, function() { window.close(); });
});

document.getElementById('open-writer-btn').addEventListener('click', function() {
  chrome.runtime.sendMessage({ action: 'openWriter' });
  window.close();
});

document.getElementById('open-verifier-btn').addEventListener('click', function() {
  chrome.tabs.create({ url: chrome.runtime.getURL('verify.html') });
  window.close();
});
