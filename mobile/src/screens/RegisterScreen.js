import React from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { register } from '../api/khApi';
import { useAuth } from '../state/auth';

export default function RegisterScreen({ navigation }) {
  const { signIn } = useAuth();
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  async function onSubmit() {
    if (!name || !email || !password) return;
    setLoading(true);
    try {
      const out = await register({
        display_name: name.trim(),
        email: email.trim(),
        password,
        location_text: location.trim() || undefined,
      });
      if (out && out.token) await signIn(out.token);
    } catch (e) {
      Alert.alert('Registro', e.message || 'No se pudo crear');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.kicker}>KingsHelp</Text>
        <Text style={styles.title}>Crear cuenta</Text>
        <Text style={styles.sub}>Empieza a ayudar y recibir ayuda.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Nombre</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Tu nombre" placeholderTextColor={theme.colors.muted} style={styles.input} />

        <Text style={styles.label}>Email</Text>
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="tu@email.com" placeholderTextColor={theme.colors.muted} style={styles.input} />

        <Text style={styles.label}>Password</Text>
        <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="password" placeholderTextColor={theme.colors.muted} style={styles.input} />

        <Text style={styles.label}>Zona</Text>
        <TextInput value={location} onChangeText={setLocation} placeholder="Barrio, ciudad" placeholderTextColor={theme.colors.muted} style={styles.input} />

        <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={onSubmit} disabled={loading}>
          <Text style={styles.btnText}>{loading ? 'Creando...' : 'Crear cuenta'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.linkText}>Ya tengo cuenta</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: 10, marginBottom: 18 },
  kicker: { color: theme.colors.brand, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  title: { color: theme.colors.text, fontSize: 28, fontWeight: '700', marginTop: 6 },
  sub: { color: theme.colors.muted, marginTop: 8 },
  card: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: 16,
  },
  label: { color: theme.colors.muted, marginTop: 10, marginBottom: 6 },
  input: {
    color: theme.colors.text,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  btn: {
    marginTop: 14,
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: '#06120E', fontWeight: '800' },
  linkBtn: { marginTop: 10, paddingVertical: 10, alignItems: 'center' },
  linkText: { color: theme.colors.brand, fontWeight: '800' },
});
