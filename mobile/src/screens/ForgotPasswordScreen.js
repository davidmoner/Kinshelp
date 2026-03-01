import React from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { forgotPassword } from '../api/khApi';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  async function onSubmit() {
    const addr = email.trim();
    if (!addr) return;
    setLoading(true);
    try {
      await forgotPassword(addr);
      Alert.alert('Listo', 'Si el email existe, te llegaran instrucciones.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Recuperar password</Text>
      <Text style={styles.sub}>Enviaremos un enlace para restablecer tu password.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="tu@email.com"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
        />

        <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={onSubmit} disabled={loading}>
          <Text style={styles.btnText}>{loading ? 'Enviando...' : 'Enviar enlace'}</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '800' },
  sub: { color: theme.colors.muted, marginTop: 8, marginBottom: 14 },
  card: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.lg, padding: 16 },
  label: { color: theme.colors.muted, marginBottom: 6 },
  input: { color: theme.colors.text, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  btn: { marginTop: 14, backgroundColor: theme.colors.brand, borderRadius: theme.radius.md, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#06120E', fontWeight: '800' },
});
