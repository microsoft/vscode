# Node definition
node 'webserver.example.com' {
  class { 'nginx':
    worker_processes => 4,
    ensure => latest,
  }

  file { '/var/www/html/index.html':
    content => template('site/index.html.erb'),
    require => Package['nginx'],
  }

  service { 'nginx':
    ensure => running,
    enable => true,
    subscribe => File['/var/www/html/index.html'],
  }
}
