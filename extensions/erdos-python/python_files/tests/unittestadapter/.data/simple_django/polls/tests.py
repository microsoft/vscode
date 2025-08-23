# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

from django.utils import timezone
from django.test import TestCase
from .models import Question
import datetime

class QuestionModelTests(TestCase):
    def test_was_published_recently_with_future_question(self):
        """
        was_published_recently() returns False for questions whose pub_date
        is in the future.
        """
        time = timezone.now() + datetime.timedelta(days=30)
        future_question: Question = Question.objects.create(pub_date=time)
        self.assertIs(future_question.was_published_recently(), False)

    def test_was_published_recently_with_future_question_2(self):
        """
        was_published_recently() returns False for questions whose pub_date
        is in the future.
        """
        time = timezone.now() + datetime.timedelta(days=30)
        future_question = Question.objects.create(pub_date=time)
        self.assertIs(future_question.was_published_recently(), True)

    def test_question_creation_and_retrieval(self):
        """
        Test that a Question can be created and retrieved from the database.
        """
        time = timezone.now()
        question = Question.objects.create(pub_date=time, question_text="What's new?")
        retrieved_question = Question.objects.get(question_text=question.question_text)
        self.assertEqual(question, retrieved_question)
        self.assertEqual(retrieved_question.question_text, "What's new?")
        self.assertEqual(retrieved_question.pub_date, time)

