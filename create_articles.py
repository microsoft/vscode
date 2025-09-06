#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор интерактивных HTML статей с тестами через OpenRouter API
Использует модель anthropic/claude-3-5-sonnet-20240620
"""

import os
import sys
import json
import time
import uuid
import random
import string
import requests
from pathlib import Path
from typing import List, Dict, Optional


class OpenRouterClient:
    """Клиент для работы с OpenRouter API"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://openrouter.ai/api/v1/chat/completions"
        self.model = "anthropic/claude-3-5-sonnet-20240620"
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "https://github.com/microsoft/vscode",
            "X-Title": "VSCode Article Generator",
            "Content-Type": "application/json"
        })
    
    def generate_article(self, topic: str, max_retries: int = 3) -> Optional[str]:
        """Генерирует статью по заданной теме с повторными попытками"""
        prompt = self._create_prompt(topic)
        
        for attempt in range(max_retries):
            try:
                response = self.session.post(
                    self.base_url,
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 8000,
                        "temperature": 0.7
                    },
                    timeout=120
                )
                response.raise_for_status()
                
                data = response.json()
                if "choices" in data and len(data["choices"]) > 0:
                    return data["choices"][0]["message"]["content"]
                else:
                    print(f"❌ Неожиданный формат ответа API (попытка {attempt + 1})")
                    
            except requests.exceptions.RequestException as e:
                print(f"❌ Ошибка API запроса (попытка {attempt + 1}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)  # Экспоненциальная задержка
                    
        return None
    
    def _create_prompt(self, topic: str) -> str:
        """Создает промпт для генерации статьи"""
        return f"""Создай ПОЛНУЮ интерактивную HTML статью на тему: "{topic}"

ОБЯЗАТЕЛЬНЫЕ ТРЕБОВАНИЯ К СТРУКТУРЕ:

1. Статья должна содержать 5-8 глав в <div class="chapter">
2. В КАЖДОЙ главе ОБЯЗАТЕЛЬНО ВСЕ 4 типа блоков:
   - <div class="info-block">📝 <strong>Важно знать:</strong> [текст]</div>
   - <div class="date-box">📅 <strong>Интересный факт:</strong> [текст]</div>
   - <div class="fact-box">🔢 <strong>Статистика:</strong> [текст]</div>
   - <div class="special-box">⭐ <strong>Особенность:</strong> [текст]</div>

3. После каждой главы - тест с 4 вариантами ответов в формате:
   <div class="quiz-container" data-question="{{NUMBER}}">
     <h4>Вопрос {{NUMBER}}</h4>
     <p>[текст вопроса]</p>
     <div class="quiz-options">
       <label><input type="radio" name="q{{NUMBER}}" value="0"> [вариант 1]</label>
       <label><input type="radio" name="q{{NUMBER}}" value="1"> [вариант 2]</label>
       <label><input type="radio" name="q{{NUMBER}}" value="2"> [вариант 3]</label>
       <label><input type="radio" name="q{{NUMBER}}" value="3"> [вариант 4]</label>
     </div>
   </div>

4. ПОЛНЫЙ HTML документ с:
   - Правильным DOCTYPE, html, head, body
   - CSS стилями для .interactive-container и всех классов
   - JavaScript для прогресс-бара и подсчета результатов
   - Поддержка эмодзи и UTF-8

ВАЖНО: Генерируй ТОЛЬКО готовый HTML код без дополнительных объяснений.
Замени {{NUMBER}} на соответствующие номера вопросов.
Укажи правильные ответы в data-correct="[номер]" для каждого quiz-container.

Тема: {topic}"""


class ArticleGenerator:
    """Основной класс для генерации статей"""
    
    def __init__(self, api_key: str, test_mode: bool = False):
        self.client = OpenRouterClient(api_key) if not test_mode else None
        self.test_mode = test_mode
        self.output_dir = Path("generated_articles")
        self.output_dir.mkdir(exist_ok=True)
    
    def generate_unique_filename(self, topic: str) -> str:
        """Генерирует уникальное имя файла"""
        # Очищаем тему от недопустимых символов
        clean_topic = "".join(c for c in topic if c.isalnum() or c in (' ', '-', '_')).strip()
        clean_topic = clean_topic.replace(' ', '_')[:50]  # Ограничиваем длину
        
        # Добавляем уникальный суффикс
        unique_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
        return f"article_{clean_topic}_{unique_id}.html"
    
    def generate_id_prefix(self) -> str:
        """Генерирует уникальный префикс для элементов"""
        return f"art_{uuid.uuid4().hex[:8]}"
    
    def process_html_content(self, html_content: str, id_prefix: str) -> str:
        """Обрабатывает HTML контент, добавляя уникальные ID"""
        # Заменяем общие ID на уникальные с префиксом
        replacements = {
            'id="progress-bar"': f'id="{id_prefix}_progress_bar"',
            'id="quiz-result"': f'id="{id_prefix}_quiz_result"',
            'id="final-score"': f'id="{id_prefix}_final_score"',
            '"progress-bar"': f'"{id_prefix}_progress_bar"',
            '"quiz-result"': f'"{id_prefix}_quiz_result"',
            '"final-score"': f'"{id_prefix}_final_score"',
            "'progress-bar'": f"'{id_prefix}_progress_bar'",
            "'quiz-result'": f"'{id_prefix}_quiz_result'",
            "'final-score'": f"'{id_prefix}_final_score'"
        }
        
        for old, new in replacements.items():
            html_content = html_content.replace(old, new)
        
        return html_content
    
    def generate_article(self, topic: str) -> bool:
        """Генерирует статью для заданной темы"""
        print(f"🔄 Генерация статьи для темы: {topic}")
        
        # Генерируем уникальный префикс и имя файла
        id_prefix = self.generate_id_prefix()
        filename = self.generate_unique_filename(topic)
        filepath = self.output_dir / filename
        
        # Получаем HTML контент от API или используем тестовый
        if self.test_mode:
            html_content = self._get_test_html(topic, id_prefix)
        else:
            html_content = self.client.generate_article(topic)
            if not html_content:
                print(f"❌ Не удалось сгенерировать статью для темы: {topic}")
                return False
        
        # Обрабатываем HTML контент
        processed_html = self.process_html_content(html_content, id_prefix)
        
        # Сохраняем файл
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(processed_html)
            print(f"✅ Статья сохранена: {filepath}")
            return True
        except Exception as e:
            print(f"❌ Ошибка сохранения файла {filepath}: {e}")
            return False
    
    def process_topics_file(self, topics_file: str) -> None:
        """Обрабатывает файл с темами"""
        topics_path = Path(topics_file)
        if not topics_path.exists():
            print(f"❌ Файл {topics_file} не найден")
            return
        
        try:
            with open(topics_path, 'r', encoding='utf-8') as f:
                topics = [line.strip() for line in f if line.strip()]
            
            if not topics:
                print(f"❌ Файл {topics_file} пуст или не содержит валидных тем")
                return
            
            print(f"📋 Найдено {len(topics)} тем для обработки")
            
            successful = 0
            for i, topic in enumerate(topics, 1):
                print(f"\n[{i}/{len(topics)}] Обработка темы: {topic}")
                if self.generate_article(topic):
                    successful += 1
                time.sleep(1)  # Небольшая пауза между запросами
            
            print(f"\n🎉 Обработка завершена: {successful}/{len(topics)} статей сгенерировано")
            
        except Exception as e:
            print(f"❌ Ошибка при чтении файла {topics_file}: {e}")
    
    def _get_test_html(self, topic: str, id_prefix: str) -> str:
        """Генерирует тестовый HTML для проверки структуры"""
        return f"""<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{topic}</title>
    <style>
        .interactive-container {{
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            font-family: Arial, sans-serif;
            line-height: 1.6;
        }}
        .chapter {{
            margin-bottom: 30px;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 8px;
        }}
        .info-block, .date-box, .fact-box, .special-box {{
            margin: 15px 0;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid;
        }}
        .info-block {{ background: #e3f2fd; border-left-color: #2196f3; }}
        .date-box {{ background: #fff3e0; border-left-color: #ff9800; }}
        .fact-box {{ background: #e8f5e8; border-left-color: #4caf50; }}
        .special-box {{ background: #fce4ec; border-left-color: #e91e63; }}
        .quiz-container {{
            margin: 20px 0;
            padding: 20px;
            background: #f5f5f5;
            border-radius: 8px;
        }}
        .quiz-options label {{
            display: block;
            margin: 10px 0;
            cursor: pointer;
        }}
        .progress-bar {{
            width: 100%;
            height: 20px;
            background: #ddd;
            border-radius: 10px;
            margin: 20px 0;
        }}
        .progress-fill {{
            height: 100%;
            background: #4caf50;
            border-radius: 10px;
            width: 0%;
            transition: width 0.3s;
        }}
        #quiz-result {{
            margin: 20px 0;
            padding: 15px;
            background: #e3f2fd;
            border-radius: 6px;
            display: none;
        }}
    </style>
</head>
<body>
    <div class="interactive-container">
        <h1>📚 {topic}</h1>
        
        <div class="progress-bar">
            <div class="progress-fill" id="progress-bar"></div>
        </div>
        
        <div class="chapter">
            <h2>Глава 1: Введение</h2>
            <p>Вводная информация по теме "{topic}".</p>
            
            <div class="info-block">
                📝 <strong>Важно знать:</strong> Это ключевая информация для понимания темы.
            </div>
            
            <div class="date-box">
                📅 <strong>Интересный факт:</strong> Удивительные детали из истории развития.
            </div>
            
            <div class="fact-box">
                🔢 <strong>Статистика:</strong> Важные цифры и данные по теме.
            </div>
            
            <div class="special-box">
                ⭐ <strong>Особенность:</strong> Уникальные характеристики и свойства.
            </div>
            
            <div class="quiz-container" data-question="1" data-correct="0">
                <h4>Вопрос 1</h4>
                <p>Тестовый вопрос по первой главе</p>
                <div class="quiz-options">
                    <label><input type="radio" name="q1" value="0"> Правильный ответ</label>
                    <label><input type="radio" name="q1" value="1"> Неправильный ответ 1</label>
                    <label><input type="radio" name="q1" value="2"> Неправильный ответ 2</label>
                    <label><input type="radio" name="q1" value="3"> Неправильный ответ 3</label>
                </div>
            </div>
        </div>
        
        <div class="chapter">
            <h2>Глава 2: Основные концепции</h2>
            <p>Детальное изучение основных концепций темы "{topic}".</p>
            
            <div class="info-block">
                📝 <strong>Важно знать:</strong> Фундаментальные принципы для понимания.
            </div>
            
            <div class="date-box">
                📅 <strong>Интересный факт:</strong> Исторические моменты развития.
            </div>
            
            <div class="fact-box">
                🔢 <strong>Статистика:</strong> Цифры и исследования по теме.
            </div>
            
            <div class="special-box">
                ⭐ <strong>Особенность:</strong> Специфические характеристики области.
            </div>
            
            <div class="quiz-container" data-question="2" data-correct="1">
                <h4>Вопрос 2</h4>
                <p>Вопрос по основным концепциям</p>
                <div class="quiz-options">
                    <label><input type="radio" name="q2" value="0"> Неправильный ответ 1</label>
                    <label><input type="radio" name="q2" value="1"> Правильный ответ</label>
                    <label><input type="radio" name="q2" value="2"> Неправильный ответ 2</label>
                    <label><input type="radio" name="q2" value="3"> Неправильный ответ 3</label>
                </div>
            </div>
        </div>
        
        <div id="quiz-result">
            <h3>Результаты теста</h3>
            <p>Ваш результат: <span id="final-score">0</span> из 2 правильных ответов</p>
        </div>
        
        <button onclick="checkAnswers()" style="padding: 10px 20px; background: #4caf50; color: white; border: none; border-radius: 5px; cursor: pointer;">
            Проверить ответы
        </button>
    </div>
    
    <script>
        let totalQuestions = 2;
        
        function updateProgress() {{
            const answered = document.querySelectorAll('input[type="radio"]:checked').length;
            const progress = (answered / totalQuestions) * 100;
            document.getElementById('progress-bar').style.width = progress + '%';
        }}
        
        function checkAnswers() {{
            let correct = 0;
            const quizContainers = document.querySelectorAll('.quiz-container');
            
            quizContainers.forEach(container => {{
                const questionNum = container.dataset.question;
                const correctAnswer = container.dataset.correct;
                const selectedAnswer = document.querySelector(`input[name="q${{questionNum}}"]:checked`);
                
                if (selectedAnswer && selectedAnswer.value === correctAnswer) {{
                    correct++;
                }}
            }});
            
            document.getElementById('final-score').textContent = correct;
            document.getElementById('quiz-result').style.display = 'block';
        }}
        
        // Добавляем обработчики для обновления прогресса
        document.addEventListener('change', function(e) {{
            if (e.target.type === 'radio') {{
                updateProgress();
            }}
        }});
    </script>
</body>
</html>"""


def main():
    """Основная функция"""
    print("🚀 Генератор интерактивных HTML статей")
    print("=" * 50)
    
    # Проверяем API ключ
    api_key = os.getenv('OPENROUTER_API_KEY')
    if not api_key:
        print("❌ Переменная окружения OPENROUTER_API_KEY не установлена")
        print("Установите её командой:")
        print("export OPENROUTER_API_KEY='sk-or-...'")
        print("или")
        print("$env:OPENROUTER_API_KEY='sk-or-...' (PowerShell)")
        sys.exit(1)
    
    # Создаем генератор
    generator = ArticleGenerator(api_key)
    
    # Обрабатываем файл с темами
    topics_file = "topics.txt"
    generator.process_topics_file(topics_file)


if __name__ == "__main__":
    main()