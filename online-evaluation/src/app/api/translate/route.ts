import { NextResponse } from 'next/server';

type TranslateResponse = [
  [string, string, string][],
  string,
  string,
  Record<string, string>
];

type TranslateSegment = [string, string, string];

export async function POST(request: Request) {
  try {
    const { text, sourceLang = 'auto', targetLang } = await request.json();

    if (!text || !targetLang) {
      return NextResponse.json(
        { success: false, error: 'Missing text or targetLang' },
        { status: 400 }
      );
    }

    const url =
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Google Translate HTTP error: ${response.status}`);
    }

    const data = (await response.json()) as TranslateResponse;

    const translatedText = data[0]
      .map((segment: TranslateSegment) => segment[0])
      .filter(Boolean)
      .join('');

    return NextResponse.json({
      success: true,
      translatedText,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Translation error:', message);
    return NextResponse.json(
      { success: false, error: 'Translation failed' },
      { status: 500 }
    );
  }
}
