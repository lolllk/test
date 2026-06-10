using System;

namespace TestSyncManager.Models
{
    public abstract class BaseEntity
    {
        public string Id { get; set; } = "";
        public long CreatedAt { get; set; }
        public long UpdatedAt { get; set; }
        public bool IsDeleted { get; set; }
    }

    public class User : BaseEntity
    {
        public string Email { get; set; } = "";
        public string? Name { get; set; }
        public string Role { get; set; } = "student";
        public string? PasswordHash { get; set; }
        public string? GoogleId { get; set; }
    }

    public class Discipline : BaseEntity
    {
        public string Title { get; set; } = "";
        public string? Description { get; set; }
        public string CreatedBy { get; set; } = "";
    }

    public class Topic : BaseEntity
    {
        public string DisciplineId { get; set; } = "";
        public string Title { get; set; } = "";
        public string? Description { get; set; }
        public int SortOrder { get; set; }
    }

    public class Test : BaseEntity
    {
        public string Title { get; set; } = "";
        public string? Description { get; set; }
        public string DisciplineId { get; set; } = "";
        public string? TopicId { get; set; }
        public int? TimeLimit { get; set; }
        public int AttemptsLimit { get; set; } = 1;
        public int PassingScore { get; set; } = 60;
        public int? QuestionsLimit { get; set; }
        public bool ShuffleQuestions { get; set; }
        public bool ShuffleAnswers { get; set; }
        public bool IsPublished { get; set; }
        public string CreatedBy { get; set; } = "";
    }

    public class Question : BaseEntity
    {
        public string TestId { get; set; } = "";
        public string Type { get; set; } = "single";
        public string Text { get; set; } = "";
        public string? ImageUrl { get; set; }
        public int Points { get; set; } = 1;
        public int SortOrder { get; set; }
    }

    public class Answer : BaseEntity
    {
        public string QuestionId { get; set; } = "";
        public string Text { get; set; } = "";
        public bool IsCorrect { get; set; }
        public string? MatchText { get; set; }
        public int SortOrder { get; set; }
    }

    public class TestAttempt : BaseEntity
    {
        public string TestId { get; set; } = "";
        public string UserId { get; set; } = "";
        public long StartedAt { get; set; }
        public long? FinishedAt { get; set; }
        public int? Score { get; set; }
        public int? MaxScore { get; set; }
        public decimal? Percentage { get; set; }
        public bool? IsPassed { get; set; }
        public string Status { get; set; } = "in_progress";
        public string? AnswersJson { get; set; }
    }

    public class StudentAnswer : BaseEntity
    {
        public string AttemptId { get; set; } = "";
        public string QuestionId { get; set; } = "";
        public string? AnswerId { get; set; }
        public string? TextAnswer { get; set; }
        public string? MatchAnswers { get; set; }
        public bool? IsCorrect { get; set; }
        public int? PointsEarned { get; set; }
    }

    public class StudentDiscipline
    {
        public string UserId { get; set; } = "";
        public string DisciplineId { get; set; } = "";
        public long CreatedAt { get; set; }
    }
}
