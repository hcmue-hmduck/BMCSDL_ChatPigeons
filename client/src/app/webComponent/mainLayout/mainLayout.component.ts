import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebarComponent/sidebarComponent.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent],
  templateUrl: './mainLayout.component.html',
  styleUrls: ['./mainLayout.component.css']
})
export class MainLayoutComponent {}
