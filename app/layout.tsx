import './globals.css';

export const metadata = {
  title: 'AI Chat UI',
  description: 'Streaming chat UI built with Next.js 16'
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, height: '100%', color: '#0f172a' }}>
        {props.children}
      </body>
    </html>
  );
}


