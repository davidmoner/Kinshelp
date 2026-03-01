import React from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { listMessages, postMessage } from '../api/khApi';
import { useAuth } from '../state/auth';
import { usePoll } from '../ui/usePoll';

function Bubble({ item, meId }) {
  const isSystem = item.kind === 'system';
  const isMe = !isSystem && meId && item.user_id === meId;
  const bg = isSystem ? 'transparent' : (isMe ? 'rgba(42,212,165,0.16)' : 'rgba(255,255,255,0.06)');
  const align = isSystem ? 'center' : (isMe ? 'flex-end' : 'flex-start');

  return (
    <View style={[styles.bubbleWrap, { alignItems: align }]}>
      <View style={[styles.bubble, { backgroundColor: bg, borderColor: theme.colors.border, borderWidth: isSystem ? 0 : 1 }]}>
        {!isSystem && !isMe && !!item.user_name && <Text style={styles.name}>{item.user_name}</Text>}
        <Text style={[styles.msg, isSystem && styles.system]}>{item.message}</Text>
      </View>
    </View>
  );
}

export default function ChatScreen({ route, navigation }) {
  const { token } = useAuth();
  const matchId = route.params?.matchId;
  const title = route.params?.title || 'Chat';
  const [meId, setMeId] = React.useState(null);
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [text, setText] = React.useState('');

  React.useEffect(() => {
    navigation.setOptions({ title });
  }, [title, navigation]);

  async function load() {
    if (!token || !matchId) return;
    setLoading(items.length === 0);
    try {
      const out = await listMessages(token, matchId, { limit: 80, offset: 0 });
      const data = (out && out.data) || [];
      setItems(data);
      const maybeMe = data.find(m => m.kind === 'user')?.user_id;
      // Can't infer reliably; keep null.
      if (!meId && maybeMe) setMeId(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, [token, matchId]);

  usePoll(load, { enabled: !!token && !!matchId && !loading, intervalMs: 3500 });

  async function onSend() {
    const msg = text.trim();
    if (!msg) return;
    setSending(true);
    try {
      await postMessage(token, matchId, msg);
      setText('');
      await load();
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen style={{ padding: 0 }}>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.colors.brand} /></View>
      ) : (
        <FlatList
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
          data={items}
          keyExtractor={(it) => String(it.id)}
          renderItem={({ item }) => <Bubble item={item} meId={meId} />}
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Escribe un mensaje"
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
            multiline
          />
          <Pressable onPress={onSend} style={[styles.send, sending && { opacity: 0.6 }]} disabled={sending}>
            <Text style={styles.sendText}>{sending ? '...' : 'Enviar'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  bubbleWrap: { marginBottom: 10 },
  bubble: { maxWidth: '86%', padding: 12, borderRadius: 16 },
  name: { color: theme.colors.muted, fontSize: 12, marginBottom: 4 },
  msg: { color: theme.colors.text, lineHeight: 20 },
  system: { color: theme.colors.muted, fontStyle: 'italic', textAlign: 'center' },
  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    backgroundColor: 'rgba(11,18,32,0.92)',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.card,
  },
  send: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  sendText: { color: '#06120E', fontWeight: '800' },
});
