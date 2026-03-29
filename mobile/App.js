import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './src/screens/LoginScreen';
import MatchesScreen from './src/screens/MatchesScreen';
import ChatScreen from './src/screens/ChatScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import MatchDetailScreen from './src/screens/MatchDetailScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import AutoMatchScreen from './src/screens/AutoMatchScreen';
import { AuthProvider, useAuth } from './src/state/auth';
import { theme } from './src/ui/theme';

const Stack = createNativeStackNavigator();

function AppNav() {
  const { token, booted } = useAuth();

  if (!booted) return null;

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: '800' },
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      {token ? (
        <>
          <Stack.Screen name="Matches" component={MatchesScreen} options={{ title: 'KingsHelp' }} />
          <Stack.Screen name="Match" component={MatchDetailScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="AutoMatch" component={AutoMatchScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Recuperar' }} />
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ title: 'Restablecer' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: theme.colors.bg,
      card: theme.colors.bg,
      text: theme.colors.text,
      border: theme.colors.border,
      primary: theme.colors.brand,
    },
  };

  return (
    <AuthProvider>
      <NavigationContainer theme={navTheme}>
        <AppNav />
      </NavigationContainer>
      <StatusBar style="light" />
    </AuthProvider>
  );
}
