'use strict';
(function () {
  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&]+)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  var token = qs('token');
  var btn = document.getElementById('btn');
  var pw = document.getElementById('pw');
  var msg = document.getElementById('msg');

  function setMsg(text, ok) {
    msg.textContent = text;
    msg.className = 'msg ' + (ok ? 'ok' : 'bad');
  }

  if (!token) {
    setMsg('Falta el token. Vuelve a solicitar el email de restablecer contrasena.', false);
    btn.disabled = true;
    return;
  }

  btn.addEventListener('click', function () {
    var newPassword = String(pw.value || '').trim();
    if (newPassword.length < 8) return setMsg('La contrasena debe tener al menos 8 caracteres.', false);

    btn.disabled = true;
    setMsg('Procesando...', true);

    fetch('/api/v1/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, new_password: newPassword })
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) { return { ok: r.ok, status: r.status, json: j }; });
    }).then(function (out) {
      if (out && out.ok && out.json && out.json.ok) {
        setMsg('Contrasena cambiada. Ya puedes iniciar sesion.', true);
        return;
      }
      setMsg('No se pudo cambiar la contrasena. Solicita un nuevo email e intentalo otra vez.', false);
    }).catch(function () {
      setMsg('Error de red. Intentalo de nuevo.', false);
    }).finally(function () {
      btn.disabled = false;
    });
  });
})();
