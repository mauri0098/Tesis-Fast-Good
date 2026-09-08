# 🔐 IMPLEMENTACIÓN DE LOGIN - FAST GOOD

Hola! He completado la implementación del sistema de login con:
- ✅ Página de login (login.html)
- ✅ Autenticación en el servidor (POST /api/login)
- ✅ Panel de Admin (index-admin.html) - con sidebar completo
- ✅ Panel de Usuario (index-usuario.html) - sin opciones de admin
- ✅ Gestión de sesiones con localStorage
- ✅ Funciones de logout

---

## 📋 PRÓXIMOS PASOS (MUY IMPORTANTE!)

### 1️⃣ AGREGAR COLUMNA "contraseña" EN SUPABASE

Ve a tu proyecto en Supabase → SQL Editor y ejecuta:

```sql
ALTER TABLE usuarios ADD COLUMN contraseña TEXT;
```

Luego, actualiza los usuarios con sus contraseñas:

```sql
UPDATE usuarios SET contraseña = 'password123' WHERE email = 'admin@fastgood.com';
UPDATE usuarios SET contraseña = 'clientpass' WHERE email = 'cliente@gmail.com';
```

(Usa las contraseñas que desees para cada usuario)

---

## 🧪 CÓMO PROBAR

### 1. Asegúrate que **id_rol = 1 significa ADMIN** en tu tabla usuarios

Si tu tabla tiene otros valores, actualiza en `auth.js` líneas donde dice:
```javascript
if (data.usuario.id_rol === 1) {  // ← Cambia el 1 si es necesario
```

### 2. Inicia el servidor:
```bash
npm install
node server.js
```

### 3. Ve a http://localhost:3000/
- Te redirigirá automáticamente a login.html
- Ingresa email y contraseña de un usuario ADMIN
- Deberías ver el panel de admin con sidebar
- Ingresa email y contraseña de un usuario NORMAL
- Deberías ver solo la página de pedidos sin sidebar

---

## 📁 ARCHIVOS CREADOS

```
frontend/
├── login.html              ← Nueva página de login
├── index-admin.html        ← Panel para administradores
├── index-usuario.html      ← Panel para clientes
└── src/js/
    └── auth.js             ← Lógica de autenticación
```

---

## 🔧 FUNCIONES ÚTILES (Disponibles en `auth.js`)

```javascript
// Verificar si hay sesión activa (se ejecuta automáticamente)
verificarAutenticacion();

// Verificar si es admin
if (esAdmin()) {
  // Mostrar opciones de admin
}

// Obtener datos del usuario
const usuario = obtenerDatosUsuario();
console.log(usuario.nombre, usuario.id_rol);

// Logout
cerrarSesion();
```

---

## 🔐 SEGURIDAD (Para el futuro)

Ahora las contraseñas se comparan en texto plano (simple). 

En **producción** deberías:
1. Instalar `npm install bcrypt`
2. Encriptar contraseñas al guardarlas
3. Validar con bcrypt.compare()
4. Usar JWT tokens en lugar de localStorage

---

## ❓ PREGUNTAS?

Si algo no funciona:
1. ¿La columna "contraseña" existe en la tabla "usuarios"?
2. ¿Hay datos de prueba con contraseñas asignadas?
3. ¿El id_rol es 1 para admin y otro número para usuarios?

---

**¡Listo! Ahora tienes un sistema de login funcional completamente integrado!** 🚀
